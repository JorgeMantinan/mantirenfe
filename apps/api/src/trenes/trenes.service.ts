import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { buscarEstaciones, getPrisma, type Prisma } from '@mantirenfe/database';
import {
  busquedaHorariosQuerySchema,
  cruzarConexiones,
  fechaGtfs,
  horaGtfs,
  HorarioTrenResponse,
  HorariosResponse,
  parsearCancelados,
  parsearRetrasos,
  PosicionTrenResponse,
  prefijoTripId,
  PuntualidadTrenResponse,
  PuntoTraza,
} from '@mantirenfe/shared-types';
import { aplicarRetrasos, type PosicionCruda } from './retrasos';
import { enriquecerPosiciones } from './enriquecer';
import { trayectosPorParadas } from './paradas';
import { Semforo } from '../common/semforo';
import {
  agruparPorEje,
  aplicarLlegadaEstimada,
  claveDeServicio,
  extremosPorTrip,
  rangoMes,
  type ExtremosTrip,
  type ServicioImpuntual,
} from './puntualidad';

interface CachePosiciones {
  datos: PosicionTrenResponse[];
  caduca: number;
}

interface EntradaPuntualidad {
  valor: PuntualidadTrenResponse[];
  caduca: number;
}

interface TripUpdates {
  retrasos: Map<string, number>;
  cancelados: Set<string>;
}

/**
 * Techo de retraso admisible al registrar impuntualidad: 6 h (21.600 s).
 *
 * El feed GTFS-RT emite `delay` absurdos que NO son retrasos de viajeros:
 *  - viajes de plataforma/mantenimiento, reconocibles por el `numeroTren` con
 *    `PLATF` (p. ej. `C4a-27318-PLATF.(0)`);
 *  - cruces de medianoche: un servicio reanudado a la 1:00 arrastra un delay
 *    de ~24 h desde la salida programada del día anterior.
 * En septiembre se colaron 1.426 min (23,7 h), 1.074 min y 735 min en el
 * ranking y lo pintaban con +1000 min imposibles. Cualquier muestra por
 * encima de este techo se descarta al escribir (el umbral de impuntualidad
 * sigue siendo PUNTUALIDAD_UMBRAL_SEG = 300 s).
 */
const PUNTUALIDAD_RETRASO_MAX_SEG = 21_600;

/** Viajes de plataforma/mantenimiento: no son servicios de viajeros. */
const PUNTUALIDAD_NUMERO_TREN_PLATAFORMA = 'PLATF';

/** Trayecto (y horario) más repetido de un grupo de impuntualidad. */
interface TrayectoFrecuente {
  cuenta: number;
  origenNombre: string;
  destinoNombre: string;
  salida: string;
  llegada: string;
  fecha: string;
}

@Injectable()
export class TrenesService {
  private readonly logger = new Logger(TrenesService.name);
  private cachePosiciones: CachePosiciones | null = null;
  private enCurso = false;
  private ultimaPersistenciaPosiciones = 0;
  private readonly intervaloPersistenciaMs =
    Number(process.env.POSICIONES_PERSISTIR_SEG ?? '600') * 1000;

  /**
   * `GET /trenes/puntualidad` es, con diferencia, la query más pesada del API:
   * para deducir el eje (origen→destino) de cada trip trae TODAS sus paradas
   * del mes — 60.502 filas de ParadaHorario ≈ 26 MB de heap y 4-6 s — más las
   * filas de `HorarioTren` del enriquecimiento (6.643 filas ≈ 14 MB).
   *
   * El problema en Render (512 MB) es el **pico concurrente**: cada visitante
   * que llega mientras otra petición calcula apila su propio copia. Por eso:
   *  - `semaforoPuntualidad` admite como máximo 2 cálculos a la vez;
   *  - solo hay UN cálculo en vuelo por clave (mes + orden) que comparten el
   *    resto de peticiones;
   *  - el resultado se cachea 60 s (LRU de 60 entradas ≈ 30 kB cada una): el
   *    ranking solo cambia cuando el worker registra nuevos retrasos.
   */
  private readonly semaforoPuntualidad = new Semforo(2);
  private readonly cachePuntualidad = new Map<string, EntradaPuntualidad>();
  private readonly puntualidadEnCurso = new Map<string, Promise<PuntualidadTrenResponse[]>>();
  private static readonly TTL_PUNTUALIDAD_MS = 60_000;
  private static readonly MAX_CACHE_PUNTUALIDAD = 60;

  async horarios(query: unknown): Promise<HorariosResponse> {
    const parsed = busquedaHorariosQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten().fieldErrors);
    }
    const { origen, destino, fecha } = parsed.data;
    const prisma = getPrisma();

    const [estacionesOrigen, estacionesDestino] = await Promise.all([
      buscarEstaciones(prisma, origen, 20),
      buscarEstaciones(prisma, destino, 20),
    ]);

    if (estacionesOrigen.length === 0 || estacionesDestino.length === 0) {
      // ¿Cuál de las dos falló? Para que la UI diga "No encontramos la
      // estación X" en vez de un genérico "sin resultados".
      const estacionesNoEncontradas = [
        ...(estacionesOrigen.length === 0 ? [origen] : []),
        ...(estacionesDestino.length === 0 ? [destino] : []),
      ];
      return {
        fuente: 'cache',
        trenes: [],
        estacionesEncontradas: false,
        motivo: 'estaciones',
        estacionesNoEncontradas,
      };
    }

    const horarios = await prisma.horarioTren.findMany({
      where: {
        origenEstacionId: { in: estacionesOrigen.map((e) => e.id) },
        destinoEstacionId: { in: estacionesDestino.map((e) => e.id) },
        fecha: new Date(`${fecha}T00:00:00Z`),
      },
      orderBy: { salida: 'asc' },
      take: 50,
      include: { origen: true, destino: true },
    });

    const trenes: HorarioTrenResponse[] = horarios.map((h) => {
      const salida = h.salida;
      const llegada = h.llegada;
      return {
        numeroTren: h.numeroTren,
        origenNombre: h.origen.nombre,
        destinoNombre: h.destino.nombre,
        salida: salida.toISOString(),
        llegada: llegada.toISOString(),
        duracionMin: Math.round((llegada.getTime() - salida.getTime()) / 60_000),
        operador: h.operador,
      };
    });

    // Sin tren directo (o como complemento): trayectos con 1 transbordo (A→X + X→B)
    const idsOrigen = estacionesOrigen.map((e) => e.id);
    const idsDestino = estacionesDestino.map((e) => e.id);
    const selectTramo = {
      numeroTren: true,
      salida: true,
      llegada: true,
      operador: true,
      origenEstacionId: true,
      destinoEstacionId: true,
      origen: { select: { nombre: true } },
      destino: { select: { nombre: true } },
    } as const;
    const [salientes, entrantes] = await Promise.all([
      prisma.horarioTren.findMany({
        where: {
          origenEstacionId: { in: idsOrigen },
          destinoEstacionId: { notIn: idsDestino },
          fecha: new Date(`${fecha}T00:00:00Z`),
        },
        orderBy: { salida: 'asc' },
        take: 400,
        select: selectTramo,
      }),
      prisma.horarioTren.findMany({
        where: {
          destinoEstacionId: { in: idsDestino },
          origenEstacionId: { notIn: idsOrigen },
          fecha: new Date(`${fecha}T00:00:00Z`),
        },
        orderBy: { salida: 'asc' },
        take: 400,
        select: selectTramo,
      }),
    ]);
    const aTramo = (h: (typeof salientes)[number]) => ({
      numeroTren: h.numeroTren,
      origenNombre: h.origen.nombre,
      destinoNombre: h.destino.nombre,
      origenEstacionId: h.origenEstacionId,
      destinoEstacionId: h.destinoEstacionId,
      salida: h.salida,
      llegada: h.llegada,
      operador: h.operador,
    });
    const conexiones = cruzarConexiones(salientes.map(aTramo), entrantes.map(aTramo), 10);
    for (const conexion of conexiones) {
      trenes.push({
        numeroTren: `${conexion.primera.numeroTren} → ${conexion.segunda.numeroTren}`,
        origenNombre: conexion.primera.origenNombre,
        destinoNombre: conexion.segunda.destinoNombre,
        salida: conexion.primera.salida.toISOString(),
        llegada: conexion.segunda.llegada.toISOString(),
        duracionMin: Math.round(
          (conexion.segunda.llegada.getTime() - conexion.primera.salida.getTime()) / 60_000,
        ),
        operador: conexion.primera.operador,
        transbordo: {
          estacion: conexion.segunda.origenNombre,
          llegadaPrimera: conexion.primera.llegada.toISOString(),
          salidaSegunda: conexion.segunda.salida.toISOString(),
          esperaMin: conexion.esperaMin,
          trenPrimera: conexion.primera.numeroTren,
          trenSegunda: conexion.segunda.numeroTren,
        },
      });
    }

    // Sin tren directo ni transbordo: `HorarioTren` solo guarda los extremos
    // de cada viaje, así que los trayectos con parada intermedia (p. ej.
    // A Coruña → Vilagarcía) no aparecen por esas dos vías. Se recomponen con
    // ParadaHorario restringido a los viajes que operan esa fecha.
    if (trenes.length === 0) {
      try {
        const intermedios = await trayectosPorParadas(prisma, {
          fecha,
          origenes: estacionesOrigen,
          destinos: estacionesDestino,
        });
        trenes.push(...intermedios);
      } catch (error) {
        // Si la tabla aún no existe (sync sin migrar) el comportamiento vuelve
        // a ser el de antes: sin resultados y motivo "sin-trenes".
        this.logger.warn(
          `No se pudieron buscar trayectos con paradas intermedias: ${String(error)}`,
        );
      }
    }

    // Ambas estaciones existen: si no hay trenes es porque no hay servicio
    // directo ni con transbordo para esa fecha (no por un nombre mal escrito).
    return {
      fuente: 'cache',
      trenes,
      estacionesEncontradas: true,
      ...(trenes.length === 0 ? { motivo: 'sin-trenes' as const } : {}),
    };
  }

  async posiciones(): Promise<{ fuente: string; trenes: PosicionTrenResponse[]; total: number }> {
    // Cadencia recomendada: el feed de posiciones se actualiza cada 15-30 s;
    // cachear 30 s evita martillear gtfsrt.renfe.com (≈86k peticiones/mes).
    const ttl = Number(process.env.POSICIONES_CACHE_SEG ?? '30') * 1000;
    if (this.cachePosiciones && this.cachePosiciones.caduca > Date.now()) {
      return {
        fuente: 'gtfs-rt',
        trenes: this.cachePosiciones.datos,
        total: this.cachePosiciones.datos.length,
      };
    }
    if (this.enCurso) {
      return {
        fuente: 'gtfs-rt',
        trenes: this.cachePosiciones?.datos ?? [],
        total: this.cachePosiciones?.datos.length ?? 0,
      };
    }

    this.enCurso = true;
    try {
      const urls = (
        process.env.GTFS_RT_URLS ??
        'https://gtfsrt.renfe.com/vehicle_positions.json,https://gtfsrt.renfe.com/vehicle_positions_LD.json'
      )
        .split(',')
        .map((u) => u.trim())
        .filter(Boolean);
      const urlRetrasos =
        process.env.GTFS_RT_TRIP_UPDATES_URL?.trim() ??
        'https://gtfsrt.renfe.com/trip_updates.json,https://gtfsrt.renfe.com/trip_updates_LD.json';

      const [resultados, tripUpdates] = await Promise.all([
        Promise.allSettled(urls.map((url) => this.obtenerFeed(url))),
        this.obtenerTripUpdates(urlRetrasos),
      ]);
      const crudas: PosicionCruda[] = [];
      for (const resultado of resultados) {
        if (resultado.status === 'fulfilled') crudas.push(...resultado.value);
      }

      const datos = aplicarRetrasos(
        crudas,
        tripUpdates.retrasos,
        new Date().toISOString(),
        tripUpdates.cancelados,
      );
      const enriquecidos = await this.enriquecerConHorarios(datos);

      this.cachePosiciones = { datos: enriquecidos, caduca: Date.now() + ttl };

      // Historial: guarda un snapshot cada N minutos (no en cada refresco)
      if (Date.now() - this.ultimaPersistenciaPosiciones >= this.intervaloPersistenciaMs) {
        this.ultimaPersistenciaPosiciones = Date.now();
        void this.persistirPosiciones(enriquecidos);
      }

      return { fuente: 'gtfs-rt', trenes: enriquecidos, total: enriquecidos.length };
    } catch (error) {
      this.logger.warn(`No se pudieron obtener posiciones GTFS-RT: ${String(error)}`);
      if (this.cachePosiciones) {
        return {
          fuente: 'gtfs-rt',
          trenes: this.cachePosiciones.datos,
          total: this.cachePosiciones.datos.length,
        };
      }
      // Sin caché: última posición conocida desde la BD (historial)
      const deBd = await this.posicionesDesdeBd();
      if (deBd.length > 0) {
        this.logger.warn({ total: deBd.length }, 'Feed caído: sirviendo posiciones desde la BD');
        return { fuente: 'bd', trenes: deBd, total: deBd.length };
      }
      return { fuente: 'gtfs-rt', trenes: [], total: 0 };
    } finally {
      this.enCurso = false;
    }
  }

  /**
   * Añade el trayecto actual (origen/destino/horas/operador) a cada posición
   * cruzándola con los horarios de ayer y hoy en la BD. Si algo falla, las
   * posiciones se devuelven sin enriquecer (no bloquea el mapa).
   */
  private async enriquecerConHorarios(
    posiciones: PosicionTrenResponse[],
  ): Promise<PosicionTrenResponse[]> {
    try {
      const claves = new Set<string>();
      for (const p of posiciones) {
        if (p.numeroTren) claves.add(p.numeroTren);
        if (p.tripId) claves.add(p.tripId);
      }
      if (claves.size === 0) return posiciones;

      const hoy = new Date();
      hoy.setUTCHours(0, 0, 0, 0);
      const ayer = new Date(hoy);
      ayer.setUTCDate(ayer.getUTCDate() - 1);

      const horarios = await getPrisma().horarioTren.findMany({
        where: {
          fecha: { in: [ayer, hoy] },
          numeroTren: { in: [...claves] },
        },
        select: {
          numeroTren: true,
          salida: true,
          llegada: true,
          operador: true,
          origen: { select: { nombre: true } },
          destino: { select: { nombre: true } },
        },
        // Red de seguridad: los números en juego son los de los trenes
        // visible en el mapa (≤ ~500) × 2 días, muy por debajo del tope.
        take: 5_000,
      });
      if (horarios.length === 0) return posiciones;

      return enriquecerPosiciones(
        posiciones,
        horarios.map((h) => ({
          numeroTren: h.numeroTren,
          origenNombre: h.origen.nombre,
          destinoNombre: h.destino.nombre,
          salida: h.salida,
          llegada: h.llegada,
          operador: h.operador,
        })),
        new Date(),
      );
    } catch (error) {
      this.logger.warn(`No se pudieron enriquecer posiciones con horarios: ${String(error)}`);
      return posiciones;
    }
  }

  private async persistirPosiciones(datos: PosicionTrenResponse[]): Promise<void> {
    try {
      const prisma = getPrisma();
      const ahora = new Date();

      // Snapshot en lote (antes: un upsert por tren = N+1 de escritura).
      // `skipDuplicates` NO actualiza las filas que ya existen, así que se
      // borran primero los ids del snapshot y se reinsertan enteras: al final
      // la tabla refleja el último snapshot con la misma semántica que el
      // upsert, pero en dos escrituras y sin idas y venidas por tren.
      const filas = datos.map((posicion) => ({
        id: posicion.id,
        numeroTren: posicion.numeroTren,
        latitud: posicion.latitud,
        longitud: posicion.longitud,
        velocidadKmh: posicion.velocidadKmh,
        retrasoSeg: posicion.retrasoSeg,
        actualizadaEn: ahora,
      }));
      if (filas.length > 0) {
        await prisma.$transaction(async (tx) => {
          await tx.posicionTren.deleteMany({ where: { id: { in: filas.map((f) => f.id) } } });
          await tx.posicionTren.createMany({ data: filas, skipDuplicates: true });
        });
      }

      // Traza: un punto por tren y snapshot (para dibujar por dónde ha pasado)
      if (datos.length > 0) {
        await prisma.posicionHistorial.createMany({
          data: datos.map((p) => ({
            vehiculoId: p.id,
            tripId: p.tripId ?? null,
            numeroTren: p.numeroTren,
            latitud: p.latitud,
            longitud: p.longitud,
            retrasoSeg: p.retrasoSeg,
            en: ahora,
          })),
        });
      }

      // Impuntualidad: un registro por servicio (tripId) y día con el retraso máximo visto
      const umbralSeg = Number(process.env.PUNTUALIDAD_UMBRAL_SEG ?? '300');
      // El "día" de impuntualidad es el peninsular (`fechaGtfs`), el mismo que
      // usan el worker y el resto de tablas con columna `fecha`: un servicio de
      // la madrugada (00:00-02:00 peninsular) no debe caer en el día UTC anterior
      const hoy = new Date(`${fechaGtfs(ahora)}T00:00:00Z`);
      const impuntuales = datos.filter(
        (p) =>
          p.tripId &&
          typeof p.retrasoSeg === 'number' &&
          p.retrasoSeg >= umbralSeg &&
          // Sanidad de la muestra: nada de artefactos (ver PUNTUALIDAD_RETRASO_MAX_SEG)
          p.retrasoSeg <= PUNTUALIDAD_RETRASO_MAX_SEG &&
          !p.numeroTren?.includes(PUNTUALIDAD_NUMERO_TREN_PLATAFORMA),
      );
      if (impuntuales.length > 0) {
        const maxPorViaje = new Map<string, number>();
        for (const p of impuntuales) {
          const viaje = p.tripId as string;
          maxPorViaje.set(viaje, Math.max(maxPorViaje.get(viaje) ?? 0, p.retrasoSeg as number));
        }
        const existentes = await prisma.impuntualidadTren.findMany({
          where: { fecha: hoy, tripId: { in: [...maxPorViaje.keys()] } },
          select: { tripId: true, retrasoMaxSeg: true },
          // Red de seguridad: los ids vienen del feed (≤ cientos de trenes/día;
          // medido: 4.628 filas en todo un mes), muy por debajo del tope.
          take: 5_000,
        });
        const previos = new Map(existentes.map((e) => [e.tripId, e.retrasoMaxSeg]));

        // En vez de un create/update por viaje: altas en un solo lote y subidas
        // agrupadas por retraso (un updateMany por cada conjunto de valores iguales)
        const aCrear: Prisma.ImpuntualidadTrenCreateManyInput[] = [];
        const aSubir = new Map<number, string[]>();
        for (const [viaje, retraso] of maxPorViaje) {
          const previo = previos.get(viaje);
          if (previo === undefined) {
            const primera = impuntuales.find((p) => p.tripId === viaje);
            aCrear.push({
              tripId: viaje,
              vehiculoId: primera?.id ?? 'desconocido',
              numeroTren: primera?.numeroTren ?? null,
              fecha: hoy,
              retrasoMaxSeg: retraso,
            });
          } else if (retraso > previo) {
            const viajes = aSubir.get(retraso) ?? [];
            viajes.push(viaje);
            aSubir.set(retraso, viajes);
          }
        }
        if (aCrear.length > 0) {
          // `skipDuplicates` cubre la carrera con otro proceso que inserte el
          // mismo (tripId, fecha): antes se tragaba el error del create
          await prisma.impuntualidadTren.createMany({ data: aCrear, skipDuplicates: true });
        }
        for (const [retraso, viajes] of aSubir) {
          await prisma.impuntualidadTren.updateMany({
            where: { fecha: hoy, tripId: { in: viajes } },
            data: { retrasoMaxSeg: retraso },
          });
        }
      }

      // Poda: lo no visto en 24 h deja de interesar (los ids estables no crecen)
      await prisma.posicionTren.deleteMany({
        where: { actualizadaEn: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
      });
      const diasHistorial = Number(process.env.POSICIONES_HISTORIAL_DIAS ?? '2');
      await prisma.posicionHistorial.deleteMany({
        where: { en: { lt: new Date(Date.now() - diasHistorial * 24 * 60 * 60 * 1000) } },
      });
    } catch (error) {
      this.logger.warn(`No se pudieron persistir posiciones: ${String(error)}`);
    }
  }

  private async posicionesDesdeBd(): Promise<PosicionTrenResponse[]> {
    try {
      const filas = await getPrisma().posicionTren.findMany({
        orderBy: { actualizadaEn: 'desc' },
        take: 500,
      });
      return filas.map((f) => ({
        id: f.id,
        numeroTren: f.numeroTren,
        latitud: f.latitud,
        longitud: f.longitud,
        velocidadKmh: f.velocidadKmh,
        retrasoSeg: f.retrasoSeg,
        actualizadaEn: f.actualizadaEn.toISOString(),
      }));
    } catch (error) {
      this.logger.warn(`No se pudieron leer posiciones de la BD: ${String(error)}`);
      return [];
    }
  }

  async traza(
    vehiculo: string,
    horas: number,
    tripId?: string | null,
  ): Promise<{ vehiculo: string; puntos: PuntoTraza[] }> {
    const limite = Math.min(Math.max(Number.isFinite(horas) ? horas : 24, 1), 48);
    const desde = new Date(Date.now() - limite * 60 * 60 * 1000);
    // Si no llega el trip, usar el del último punto registrado: sin esto, la
    // traza mezclaría servicios distintos del mismo vehículo (líneas rectas fantasma)
    let filtroTrip = tripId;
    if (!filtroTrip) {
      const ultimo = await getPrisma().posicionHistorial.findFirst({
        where: { vehiculoId: vehiculo, tripId: { not: null }, en: { gte: desde } },
        orderBy: { en: 'desc' },
        select: { tripId: true },
      });
      filtroTrip = ultimo?.tripId ?? null;
    }
    const filas = await getPrisma().posicionHistorial.findMany({
      where: {
        vehiculoId: vehiculo,
        en: { gte: desde },
        ...(filtroTrip ? { tripId: filtroTrip } : {}),
      },
      orderBy: { en: 'asc' },
      take: 2000,
      select: { en: true, latitud: true, longitud: true, retrasoSeg: true, tripId: true },
    });
    return {
      vehiculo,
      puntos: filas.map((f) => ({
        en: f.en.toISOString(),
        latitud: f.latitud,
        longitud: f.longitud,
        retrasoSeg: f.retrasoSeg,
        tripId: f.tripId,
      })),
    };
  }

  /**
   * `GET /trenes/estacion`: salidas de una estación para una fecha.
   *
   * `HorarioTren` solo guarda los EXTREMOS de cada viaje (`origenEstacionId` =
   * primera parada), así que filtrar por origen deja fuera a toda estación que
   * sea parada intermedia (Arcade: 0 filas de origen, 19 salidas reales). Los
   * trenes que paran en la estación se resuelven con `ParadaHorario` (sin
   * fecha) restringido a los viajes que operan ese día.
   *
   * Orden de las consultas — **estación primero**: la versión anterior cargaba
   * 20.000 filas de `HorarioTren` de TODAS las estaciones para después
   * descartar casi todas; ahora solo se piden ids de viaje de ESTA estación:
   *  1. `ParadaHorario` de la estación con `distinct: tripId` → qué viajes
   *     paran aquí (solo los ids, sin horarios).
   *  2. `HorarioTren` de la fecha filtrado por esos tripId → una fila por viaje
   *     que opera ese día Y pasa por la estación.
   *  3. Las paradas de la estación en esos viajes (solo con `salidaMin`).
   *
   * Semántica de la fila devuelta (tipo `HorarioTrenResponse`):
   *  - `origenNombre` = **la estación consultada**: la ficha es de SUS salidas,
   *    aunque el viaje haya empezado antes.
   *  - `destinoNombre`/`llegada` = destino y llegada finales del viaje (los
   *    extremos que guarda `HorarioTren`), y `salida` = la hora en la que el
   *    tren sale de ESTA estación (`salidaMin` GTFS → fecha + minutos), así
   *    que `duracionMin` es el trayecto restante hasta el destino final.
   *  - Solo salen trenes en los que se puede subir: una parada sin `salidaMin`
   *    (el tren pasa o termina aquí sin permitir salida) no se lista.
   */
  async salidasEstacion(estacion: string, fecha: string): Promise<HorarioTrenResponse[]> {
    const prisma = getPrisma();
    const encontradas = await buscarEstaciones(prisma, estacion, 3);
    const mejor = encontradas[0];
    if (!mejor) return [];

    // Viajes con parada en ESTA estación: solo ids distintos (`ParadaHorario`
    // no tiene fecha, así que traen todos los días a la vez).
    const deLaEstacion = await prisma.paradaHorario.findMany({
      where: { estacionId: mejor.id },
      distinct: ['tripId'],
      orderBy: { tripId: 'asc' },
      select: { tripId: true },
      // Red de seguridad: la estación más transitada (Chamartín) ronda los 30k
      // viajes distintos; el tope descartaría viajes enteros, nunca sueltos.
      take: 100_000,
    });
    const tripsDeLaEstacion = deLaEstacion.map((p) => p.tripId);
    if (tripsDeLaEstacion.length === 0) return [];

    // De esos, solo los que operan ese día (una fila por trip + fecha).
    const delDia = await prisma.horarioTren.findMany({
      where: { fecha: new Date(`${fecha}T00:00:00Z`), tripId: { in: tripsDeLaEstacion } },
      select: {
        tripId: true,
        numeroTren: true,
        operador: true,
        llegada: true,
        origen: { select: { nombre: true } },
        destino: { select: { nombre: true } },
      },
      take: 20_000,
    });
    const porTrip = new Map<string, (typeof delDia)[number]>();
    for (const viaje of delDia) {
      // Las filas antiguas (sin tripId) no permiten cruzar con ParadaHorario
      if (viaje.tripId && !porTrip.has(viaje.tripId)) porTrip.set(viaje.tripId, viaje);
    }
    if (porTrip.size === 0) return [];

    // Paradas de ESTA estación en esos viajes (índice [estacionId, tripId]).
    // `salidaMin` null = el tren pasa/termina sin dejar subir: no es una salida.
    const paradas = await prisma.paradaHorario.findMany({
      where: {
        estacionId: mejor.id,
        tripId: { in: [...porTrip.keys()] },
        salidaMin: { not: null },
      },
      select: { tripId: true, orden: true, salidaMin: true },
      take: 20_000,
    });

    // Salida más temprana por viaje (una estación puede repetirse en el trip)
    const salidaPorTrip = new Map<string, number>();
    for (const parada of paradas) {
      if (parada.salidaMin === null) continue;
      const previa = salidaPorTrip.get(parada.tripId);
      if (previa === undefined || parada.salidaMin < previa) {
        salidaPorTrip.set(parada.tripId, parada.salidaMin);
      }
    }
    if (salidaPorTrip.size === 0) return [];

    const [ano, mes, diaDelMes] = fecha.split('-').map(Number);
    if (ano === undefined || mes === undefined || diaDelMes === undefined) return [];
    const baseMs = Date.UTC(ano, mes - 1, diaDelMes);

    const salidas: HorarioTrenResponse[] = [];
    for (const [tripId, salidaMin] of salidaPorTrip) {
      const viaje = porTrip.get(tripId);
      if (!viaje) continue;
      const salidaMs = baseMs + salidaMin * 60_000;
      salidas.push({
        numeroTren: viaje.numeroTren,
        // El primer extremo real del viaje (no la estación consultada): los
        // trenes que terminan en la consulta se verían "A Coruña → A Coruña".
        origenNombre: viaje.origen.nombre,
        destinoNombre: viaje.destino.nombre,
        salida: new Date(salidaMs).toISOString(),
        llegada: viaje.llegada.toISOString(),
        duracionMin: Math.max(0, Math.round((viaje.llegada.getTime() - salidaMs) / 60_000)),
        operador: viaje.operador,
      });
    }
    salidas.sort((a, b) => a.salida.localeCompare(b.salida));
    return salidas.slice(0, 100);
  }

  async puntualidadMes(mes?: string, orden?: string): Promise<PuntualidadTrenResponse[]> {
    // Clave CANÓNICA (no la entrada cruda del usuario): `rangoMes` ya resuelve
    // mes inválido = mes en curso y solo hay dos ordenaciones reales. Sin esto,
    // un `?mes=basura` o un `?orden=x` distinto fabricaría claves nuevas y
    // saltaría la caché + el single-flight, permitiendo N cálculos de 63k filas
    // en paralelo (justo lo que revienta los 512 MB de Render).
    const { desde, hasta } = rangoMes(mes);
    const clave = `${desde.toISOString()}|${hasta.toISOString()}|${orden === 'impuntualidad' ? 'impuntualidad' : 'veces'}`;

    const cacheada = this.cachePuntualidad.get(clave);
    if (cacheada) {
      if (cacheada.caduca > Date.now()) {
        // Reinsertar la marca la como la más reciente (LRU)
        this.cachePuntualidad.delete(clave);
        this.cachePuntualidad.set(clave, cacheada);
        return cacheada.valor;
      }
      this.cachePuntualidad.delete(clave);
    }

    // Mismo mes y orden en vuelo: en vez de repetir 60k filas, se reutiliza
    const enCurso = this.puntualidadEnCurso.get(clave);
    if (enCurso) return enCurso;

    const calculo = this.semaforoPuntualidad
      .ejecutar(() => this.calcularPuntualidadMes(mes, orden))
      .then((valor) => {
        this.cachePuntualidad.set(clave, {
          valor,
          caduca: Date.now() + TrenesService.TTL_PUNTUALIDAD_MS,
        });
        while (this.cachePuntualidad.size > TrenesService.MAX_CACHE_PUNTUALIDAD) {
          const masAntigua = this.cachePuntualidad.keys().next().value;
          if (masAntigua === undefined) break;
          this.cachePuntualidad.delete(masAntigua);
        }
        return valor;
      })
      .finally(() => {
        this.puntualidadEnCurso.delete(clave);
      });
    this.puntualidadEnCurso.set(clave, calculo);
    return calculo;
  }

  private async calcularPuntualidadMes(
    mes?: string,
    orden?: string,
  ): Promise<PuntualidadTrenResponse[]> {
    const { desde, hasta } = rangoMes(mes);
    const prisma = getPrisma();

    // Servicios impuntuales del mes (≈4,4k filas medidas): se traen enteros
    // para poder contarlos por (tripId, fecha) y agruparlos por eje en memoria.
    // El `take` es una red de seguridad: un mes con más servicios de ese
    // tope simplemente se queda con los primeros, nunca carga sin límite.
    const filas = await prisma.impuntualidadTren.findMany({
      where: { fecha: { gte: desde, lt: hasta } },
      select: {
        tripId: true,
        vehiculoId: true,
        numeroTren: true,
        fecha: true,
        retrasoMaxSeg: true,
      },
      take: 20_000,
    });
    if (filas.length === 0) return [];

    // Extremos de los trips del mes en UNA query (ParadaHorario: orden mín =
    // origen del viaje, orden máx = destino). Sin paradas para un trip, ese
    // servicio cae al agrupado por vehículo (fallback).
    // Medido: 3.998 trips distintos → 60.502 filas (≈26 MB de heap, 4-6 s).
    // El orden por PK [tripId, orden] + `take` garantiza que un tope solo
    // descarte trips enteros (luego agrupados por vehículo), no extremos sueltos.
    const tripIds = [...new Set(filas.map((f) => f.tripId))];
    const paradas = await prisma.paradaHorario.findMany({
      where: { tripId: { in: tripIds } },
      select: { tripId: true, orden: true, estacionId: true, llegadaMin: true, salidaMin: true },
      orderBy: [{ tripId: 'asc' }, { orden: 'asc' }],
      take: 150_000,
    });
    const extremos = extremosPorTrip(paradas);

    // Nombres reales de las estaciones extremo: otra única query (sin N+1)
    const estacionesIds = [
      ...new Set([...extremos.values()].flatMap((e) => [e.origenEstacionId, e.destinoEstacionId])),
    ];
    const estaciones =
      estacionesIds.length > 0
        ? await prisma.estacion.findMany({
            where: { id: { in: estacionesIds } },
            select: { id: true, nombre: true },
            take: 5_000,
          })
        : [];
    const nombres = new Map(estaciones.map((e) => [e.id, e.nombre]));

    const resultado = agruparPorEje(filas, extremos, nombres);

    // Fallback: lo que el eje no cubre (trips sin paradas en el feed) se
    // completa con los horarios del mes, como antes. Solo consulta si queda
    // algo por rellenar: los grupos con eje ya llevan nombres, salida y llegada.
    try {
      await this.enriquecerPuntualidad(resultado, filas, extremos, desde, hasta);
    } catch (error) {
      this.logger.warn(`No se pudo enriquecer la puntualidad: ${String(error)}`);
    }

    aplicarLlegadaEstimada(resultado);

    const alfabeticamente = (a: PuntualidadTrenResponse, b: PuntualidadTrenResponse) =>
      (a.clave ?? a.vehiculoId).localeCompare(b.clave ?? b.vehiculoId);
    if (orden === 'impuntualidad') {
      resultado.sort(
        (a, b) =>
          b.retrasoMedioSeg - a.retrasoMedioSeg ||
          b.vecesImpuntuales - a.vecesImpuntuales ||
          alfabeticamente(a, b),
      );
    } else {
      resultado.sort(
        (a, b) =>
          b.vecesImpuntuales - a.vecesImpuntuales ||
          b.retrasoMedioSeg - a.retrasoMedioSeg ||
          alfabeticamente(a, b),
      );
    }
    return resultado.slice(0, 100);
  }

  /**
   * Complementa los grupos a los que les faltan datos (trips sin paradas, y
   * por tanto sin eje) con su trayecto y horario del mes desde `HorarioTren`,
   * igual que el enriquecimiento original. Solo se rellena lo que falta: los
   * datos resueltos por eje (nombres, salida, llegada) mandan.
   */
  private async enriquecerPuntualidad(
    filas: PuntualidadTrenResponse[],
    servicios: ServicioImpuntual[],
    extremos: Map<string, ExtremosTrip>,
    desde: Date,
    hasta: Date,
  ): Promise<void> {
    const pendientes = new Set(filas.filter((f) => !f.origenNombre).map((f) => f.clave));
    if (pendientes.size === 0) return;

    const numeros = new Set<string>();
    for (const servicio of servicios) {
      if (!pendientes.has(claveDeServicio(servicio, extremos))) continue;
      if (servicio.numeroTren) numeros.add(servicio.numeroTren);
      numeros.add(prefijoTripId(servicio.tripId));
    }
    if (numeros.size === 0) return;

    const horarios = await getPrisma().horarioTren.findMany({
      where: { numeroTren: { in: [...numeros] }, fecha: { gte: desde, lt: hasta } },
      select: {
        numeroTren: true,
        fecha: true,
        salida: true,
        llegada: true,
        origen: { select: { nombre: true } },
        destino: { select: { nombre: true } },
      },
      // Medido: 6.643 filas (≈14 MB) para un mes completo. El tope solo
      // afecta al fallback de grupos sin eje (quedan sin enriquecer).
      take: 20_000,
    });
    if (horarios.length === 0) return;

    const porClave = new Map(
      horarios.map((h) => [`${h.numeroTren}|${h.fecha.toISOString().slice(0, 10)}`, h]),
    );
    const porGrupo = new Map<string, Map<string, TrayectoFrecuente>>();
    for (const servicio of servicios) {
      const clave = claveDeServicio(servicio, extremos);
      if (!pendientes.has(clave)) continue;
      const dia = servicio.fecha.toISOString().slice(0, 10);
      const horario =
        porClave.get(`${servicio.numeroTren ?? ''}|${dia}`) ??
        porClave.get(`${prefijoTripId(servicio.tripId)}|${dia}`);
      if (!horario) continue;
      const salida = horaGtfs(horario.salida.toISOString());
      const claveTrayecto = `${horario.origen.nombre}→${horario.destino.nombre}|${salida}`;
      const trayectos = porGrupo.get(clave) ?? new Map<string, TrayectoFrecuente>();
      const previo = trayectos.get(claveTrayecto);
      trayectos.set(
        claveTrayecto,
        previo
          ? { ...previo, cuenta: previo.cuenta + 1 }
          : {
              cuenta: 1,
              origenNombre: horario.origen.nombre,
              destinoNombre: horario.destino.nombre,
              salida,
              llegada: horaGtfs(horario.llegada.toISOString()),
              fecha: dia,
            },
      );
      porGrupo.set(clave, trayectos);
    }

    for (const fila of filas) {
      const mejor = [...(porGrupo.get(fila.clave ?? '')?.values() ?? [])].sort(
        (a, b) => b.cuenta - a.cuenta,
      )[0];
      if (!mejor) continue;
      fila.origenNombre ??= mejor.origenNombre;
      fila.destinoNombre ??= mejor.destinoNombre;
      fila.salida ??= mejor.salida;
      fila.llegada ??= mejor.llegada;
      fila.fecha ??= mejor.fecha;
    }
  }

  private async obtenerTripUpdates(url: string): Promise<TripUpdates> {
    const urls = url
      .split(',')
      .map((u) => u.trim())
      .filter(Boolean);
    const resultados = await Promise.allSettled(urls.map((u) => this.descargarTripUpdates(u)));
    const retrasos = new Map<string, number>();
    const cancelados = new Set<string>();
    for (const [i, resultado] of resultados.entries()) {
      if (resultado.status === 'rejected') {
        this.logger.warn(
          `No se pudieron obtener trip updates GTFS-RT (${urls[i]}): ${String(resultado.reason)}`,
        );
        continue;
      }
      for (const [clave, delay] of resultado.value.retrasos) {
        const previo = retrasos.get(clave);
        if (previo === undefined || delay > previo) retrasos.set(clave, delay);
      }
      for (const clave of resultado.value.cancelados) cancelados.add(clave);
    }
    return { retrasos, cancelados };
  }

  private async descargarTripUpdates(url: string): Promise<TripUpdates> {
    const controlador = new AbortController();
    const timeout = setTimeout(() => controlador.abort(), 8_000);
    try {
      const respuesta = await fetch(url, {
        signal: controlador.signal,
        headers: { accept: 'application/json' },
      });
      if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);
      const feed = await respuesta.json();
      return {
        retrasos: parsearRetrasos(feed),
        cancelados: parsearCancelados(feed),
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  private async obtenerFeed(url: string): Promise<PosicionCruda[]> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8_000);
    try {
      const respuesta = await fetch(url, {
        signal: controller.signal,
        headers: { accept: 'application/json' },
      });
      if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);
      const feed = (await respuesta.json()) as {
        entity?: Array<{
          id?: string;
          vehicle?: {
            position?: { latitude?: number; longitude?: number; speed?: number };
            timestamp?: number;
            trip?: { tripId?: string };
            vehicle?: { label?: string; id?: string };
          };
        }>;
      };

      const crudas: PosicionCruda[] = [];
      for (const entity of feed.entity ?? []) {
        const vehicle = entity.vehicle;
        const position = vehicle?.position;
        if (!position || position.latitude == null || position.longitude == null) continue;
        crudas.push({
          id: vehicle.vehicle?.id ?? vehicle.trip?.tripId ?? entity.id ?? crypto.randomUUID(),
          numeroTren: vehicle.vehicle?.label ?? vehicle.trip?.tripId ?? null,
          latitud: position.latitude,
          longitud: position.longitude,
          velocidadKmh:
            position.speed != null && position.speed >= 0
              ? Math.round(position.speed * 3.6 * 10) / 10
              : null,
          tripId: vehicle.trip?.tripId ?? null,
        });
      }
      return crudas;
    } finally {
      clearTimeout(timeout);
    }
  }
}
