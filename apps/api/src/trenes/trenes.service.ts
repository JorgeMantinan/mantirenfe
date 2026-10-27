import { BadRequestException, BadGatewayException, Injectable, Logger } from '@nestjs/common';
import { buscarEstaciones, getPrisma } from '@mantirenfe/database';
import {
  busquedaHorariosQuerySchema,
  cruzarConexiones,
  EstadoDisponibilidad,
  horaGtfs,
  HorarioTrenResponse,
  HorariosResponse,
  obtenerPosicionesRetrasadas,
  persistirPosicionesSnapshot,
  PosicionTrenResponse,
  prefijoTripId,
  PuntualidadTrenResponse,
  PuntoTraza,
  TrenDisponibilidadResponse,
} from '@mantirenfe/shared-types';
import { FuenteRenfeDwr } from '@mantirenfe/venta';
import { enriquecerPosiciones, type HorarioActivo } from './enriquecer';
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
  /** Cliente DWR de la venta: su caché por ruta+fecha es por proceso (módulo). */
  private readonly fuenteVenta = new FuenteRenfeDwr();
  private cachePosiciones: CachePosiciones | null = null;
  // Horarios por número para enriquecer el mapa: se recargan como mucho cada
  // 10 min (y se limpian al cambiar de día). Antes se consultaban a la BD en
  // CADA refresco del mapa (cada 30 s, hasta 5.000 filas de horarioTren):
  // era de los mayores consumidores de egress de Supabase.
  private horariosPorTren = new Map<string, HorarioActivo[]>();
  private rellenoHorariosHasta = 0;
  private diaHorarios = '';
  private enCurso = false;
  private ultimaPersistenciaPosiciones = 0;
  private readonly intervaloPersistenciaMs =
    //15 min (antes10): cada snapshot reescribe estado + historial de traza +
    // impuntualidad con sus índices — escrituras que cuentan para el Disk IO.
    // La traza sigue sin saltarse segmentos (el corte del mapa es a30 min).
    Number(process.env.POSICIONES_PERSISTIR_SEG ?? '900') * 1000;

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
  //15 minutos: la puntualidad de un mes cambia poco y cada recálculo cuesta
  // ~9 MB de LECTURA de ParadaHorario (Disc IO); con60 s era un goteo.
  private static readonly TTL_PUNTUALIDAD_MS = 15 * 60_000;
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
      // Feeds de posiciones + trip updates + retrasos: cadena compartida con
      // el snapshot del worker (shared-types/src/posiciones.ts).
      const datos = await obtenerPosicionesRetrasadas({
        aviso: (mensaje) => this.logger.warn(mensaje),
      });
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
      const numeros = [
        ...new Set(posiciones.map((p) => p.numeroTren).filter((n): n is string => Boolean(n))),
      ];
      if (numeros.length === 0) return posiciones;

      const hoy = new Date();
      hoy.setUTCHours(0, 0, 0, 0);
      const ayer = new Date(hoy);
      ayer.setUTCDate(ayer.getUTCDate() - 1);

      // Caché por número: los horarios del día no cambian. Solo se piden los
      // que falten y como mucho cada 10 min; al cambiar de día se vacía.
      const dia = hoy.toISOString().slice(0, 10);
      if (this.diaHorarios !== dia) {
        this.diaHorarios = dia;
        this.horariosPorTren.clear();
        this.rellenoHorariosHasta = 0;
      }
      const faltan = numeros.filter((n) => !this.horariosPorTren.has(n));
      if (faltan.length > 0 && Date.now() >= this.rellenoHorariosHasta) {
        this.rellenoHorariosHasta = Date.now() + 10 * 60_000;
        const horarios = await getPrisma().horarioTren.findMany({
          where: {
            fecha: { in: [ayer, hoy] },
            numeroTren: { in: faltan },
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
        for (const h of horarios) {
          const lista = this.horariosPorTren.get(h.numeroTren) ?? [];
          lista.push({
            numeroTren: h.numeroTren,
            origenNombre: h.origen.nombre,
            destinoNombre: h.destino.nombre,
            salida: h.salida,
            llegada: h.llegada,
            operador: h.operador,
          });
          this.horariosPorTren.set(h.numeroTren, lista);
        }
        // Los que no traen horario quedan marcados: no se vuelven a pedir
        for (const n of faltan) {
          if (!this.horariosPorTren.has(n)) this.horariosPorTren.set(n, []);
        }
      }

      const planos = numeros.flatMap((n) => this.horariosPorTren.get(n) ?? []);
      if (planos.length === 0) return posiciones;
      return enriquecerPosiciones(posiciones, planos, new Date());
    } catch (error) {
      this.logger.warn(`No se pudieron enriquecer posiciones con horarios: ${String(error)}`);
      return posiciones;
    }
  }

  private async persistirPosiciones(datos: PosicionTrenResponse[]): Promise<void> {
    // Implementación compartida con el snapshot programado del worker
    // (shared-types/src/posiciones.ts): estado + traza + impuntualidad + poda.
    await persistirPosicionesSnapshot(getPrisma(), datos, (mensaje) => this.logger.warn(mensaje));
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
   *  - `origenNombre` = **el primer extremo real del viaje** (no la estación
   *    consultada): los trenes que terminan aquí ni siquiera se listan.
   *  - `destinoNombre`/`llegada` = destino y llegada finales del viaje (los
   *    extremos que guarda `HorarioTren`), y `salida` = la hora en la que el
   *    tren sale de ESTA estación (`salidaMin` GTFS → fecha + minutos), así
   *    que `duracionMin` es el trayecto restante hasta el destino final.
   *  - Solo salen trenes en los que se puede subir: una parada sin `salidaMin`
   *    no se lista, y los viajes cuyo destino final es la estación consultada
   *    se excluyen (no son salidas).
   */
  async salidasEstacion(estacion: string, fecha: string): Promise<HorarioTrenResponse[]> {
    const prisma = getPrisma();
    const encontradas = await buscarEstaciones(prisma, estacion, 3);
    const mejor = encontradas[0];
    if (!mejor) return [];

    // Orden inverso al histórico: PRIMERO los viajes del día (una fila por
    // trip + fecha, ~4.400, servida por el índice [fecha, origenEstacionId])
    // y DESPUÉS sus paradas en esta estación (PK [tripId, orden] + filtro de
    // estación).
    //
    // Antes empezaba por la estación: `ParadaHorario` no tiene fecha, así que
    // devolvía los 30k viajes de TODOS los días de la estación más transitada
    // y había que cruzarlos en memoria con el día. Con este orden el cruce
    // cabe en el motor y se pudo borrar el índice [estacionId, tripId] de
    // 173 MB (medido con db:io: 604 lecturas en 20 días, el 53 % de la tabla).
    const viajesDelDia = await prisma.horarioTren.findMany({
      where: { fecha: new Date(`${fecha}T00:00:00Z`) },
      select: {
        tripId: true,
        numeroTren: true,
        operador: true,
        llegada: true,
        destinoEstacionId: true,
        origen: { select: { nombre: true } },
        destino: { select: { nombre: true } },
      },
      take: 20_000,
    });
    const porTrip = new Map<string, (typeof viajesDelDia)[number]>();
    for (const viaje of viajesDelDia) {
      // Las filas antiguas (sin tripId) no permiten cruzar con ParadaHorario
      if (viaje.tripId && !porTrip.has(viaje.tripId)) porTrip.set(viaje.tripId, viaje);
    }
    if (porTrip.size === 0) return [];

    // Paradas de ESTA estación en los viajes de ese día (PK [tripId, orden]).
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
      // El viaje TERMINA en la estación consultada: no hay dónde ir, no es una
      // salida subible (antes salían como "A Coruña -> A Coruña" de 0 min).
      if (viaje.destinoEstacionId === mejor.id) continue;
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

  /**
   * `GET /trenes/disponibilidad`: plazas y precio de una ruta+fecha para
   * decidir antes de crear una alerta. Resuelve las estaciones (mismo criterio
   * que `salidasEstacion`: la mejor coincidencia) y consulta la venta DWR, que
   * trae su propia caché por ruta+fecha con single-flight y TTL
   * `DWR_CACHE_SEG` (120 s por defecto): la API no necesita caché extra.
   *
   * La fuente es la de producción (venta.renfe.com): si falla o suspende por
   * rate-limit se responde 502 con mensaje saneado (el detalle viaja solo a
   * log/Sentry), nunca con el texto crudo del cliente DWR.
   */
  async disponibilidad(query: unknown): Promise<TrenDisponibilidadResponse[]> {
    const parsed = busquedaHorariosQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten().fieldErrors);
    }
    const { origen, destino, fecha } = parsed.data;
    const prisma = getPrisma();
    const [estacionesOrigen, estacionesDestino] = await Promise.all([
      buscarEstaciones(prisma, origen, 3),
      buscarEstaciones(prisma, destino, 3),
    ]);
    const origenResuelto = estacionesOrigen[0];
    const destinoResuelto = estacionesDestino[0];
    // Sin estación no hay ruta que consultar a la venta: vacío, como en salidas
    if (!origenResuelto || !destinoResuelto) return [];

    let estado: EstadoDisponibilidad;
    try {
      estado = await this.fuenteVenta.getDisponibilidad({
        origenNombre: origenResuelto.nombre,
        destinoNombre: destinoResuelto.nombre,
        fecha,
      });
    } catch (error) {
      this.logger.warn(
        `Disponibilidad no disponible para ${origenResuelto.nombre} → ${destinoResuelto.nombre} (${fecha}): ${String(error)}`,
      );
      throw new BadGatewayException('La venta de Renfe no está disponible en este momento');
    }

    return estado.trenes
      .map((t) => ({
        numeroTren: t.numeroTren,
        salida: t.salida,
        llegada: t.horaLlegada ?? null,
        tipoTren: t.tipoTren ?? null,
        tarifa: t.tarifa ?? null,
        disponible: t.disponible,
        precioMin: t.precioMin,
        cancelado: t.cancelado ?? false,
      }))
      .sort((a, b) => a.salida.localeCompare(b.salida));
  }

  async puntualidadMes(
    mes?: string,
    orden?: string,
    q?: string,
    limite?: string,
  ): Promise<PuntualidadTrenResponse[]> {
    // Clave CANÓNICA por MES (no la entrada cruda del usuario): `rangoMes` ya
    // resuelve mes inválido = mes en curso. El orden y la búsqueda se aplican
    // después sobre la lista cacheada (son cortes en memoria), así que un
    // `?orden=` o un `?q=` distintos NO recalculan las 63k filas (antes la
    // clave incluía el orden: dos caches ×9 MB de paradas cada caducidad).
    const { desde, hasta } = rangoMes(mes);
    const clave = `${desde.toISOString()}|${hasta.toISOString()}`;

    const cacheada = this.cachePuntualidad.get(clave);
    if (cacheada) {
      if (cacheada.caduca > Date.now()) {
        // Reinsertar la marca la como la más reciente (LRU)
        this.cachePuntualidad.delete(clave);
        this.cachePuntualidad.set(clave, cacheada);
        return this.cortarPuntualidad(cacheada.valor, orden, q, limite);
      }
      this.cachePuntualidad.delete(clave);
    }

    // Mismo mes en vuelo: en vez de repetir 63k filas, se reutiliza
    const enCurso = this.puntualidadEnCurso.get(clave);
    if (enCurso) return enCurso.then((v) => this.cortarPuntualidad(v, orden, q, limite));

    const calculo = this.semaforoPuntualidad
      .ejecutar(() => this.calcularPuntualidadMes(mes))
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
    return calculo.then((v) => this.cortarPuntualidad(v, orden, q, limite));
  }

  /**
   * Corte de petición sobre la lista cacheada (que va completa y ordenada por
   * veces): busca por tren o trayecto, reordena si hace falta y limita el
   * resultado — 20 por defecto, los peores del mes.
   */
  private cortarPuntualidad(
    lista: PuntualidadTrenResponse[],
    orden?: string,
    q?: string,
    limite?: string,
  ): PuntualidadTrenResponse[] {
    const texto = q?.trim().toLowerCase() ?? '';
    let filas = lista;
    if (texto) {
      filas = filas.filter((f) => {
        const tren = (f.numeroTren ?? f.vehiculoId).toLowerCase();
        const origen = (f.origenNombre ?? '').toLowerCase();
        const destino = (f.destinoNombre ?? '').toLowerCase();
        return tren.includes(texto) || origen.includes(texto) || destino.includes(texto);
      });
    }
    if (orden === 'impuntualidad') {
      const alfabeticamente = (a: PuntualidadTrenResponse, b: PuntualidadTrenResponse) =>
        (a.clave ?? a.vehiculoId).localeCompare(b.clave ?? b.vehiculoId);
      filas = [...filas].sort(
        (a, b) =>
          b.retrasoMedioSeg - a.retrasoMedioSeg ||
          b.vecesImpuntuales - a.vecesImpuntuales ||
          alfabeticamente(a, b),
      );
    }
    const tope = Math.min(Math.max(Number(limite) || 20, 1), 200);
    return filas.slice(0, tope);
  }

  private async calcularPuntualidadMes(mes?: string): Promise<PuntualidadTrenResponse[]> {
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

    // Solo se listan trenes con trayecto completo (origen, destino, salida y
    // llegada): un tren que solo aparece por su número, sin ruta conocida, no
    // aporta nada al ranking (es el «no está en funcionamiento» del feed).
    const conTrayecto = resultado.filter(
      (f) => f.origenNombre && f.destinoNombre && f.salida && f.llegada,
    );

    // Orden canónico de la caché: los más veces impuntuales primero; el
    // orden que pida el cliente se aplica en `cortarPuntualidad`.
    conTrayecto.sort(
      (a, b) =>
        b.vecesImpuntuales - a.vecesImpuntuales ||
        b.retrasoMedioSeg - a.retrasoMedioSeg ||
        (a.clave ?? a.vehiculoId).localeCompare(b.clave ?? b.vehiculoId),
    );
    return conTrayecto;
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
}
