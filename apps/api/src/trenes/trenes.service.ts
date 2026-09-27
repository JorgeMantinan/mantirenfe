import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { buscarEstaciones, getPrisma } from '@mantirenfe/database';
import {
  busquedaHorariosQuerySchema,
  cruzarConexiones,
  horaGtfs,
  HorarioTrenResponse,
  parsearRetrasos,
  PosicionTrenResponse,
  prefijoTripId,
  PuntualidadTrenResponse,
  PuntoTraza,
} from '@mantirenfe/shared-types';
import { aplicarRetrasos, type PosicionCruda } from './retrasos';
import { enriquecerPosiciones } from './enriquecer';

interface CachePosiciones {
  datos: PosicionTrenResponse[];
  caduca: number;
}

@Injectable()
export class TrenesService {
  private readonly logger = new Logger(TrenesService.name);
  private cachePosiciones: CachePosiciones | null = null;
  private enCurso = false;
  private ultimaPersistenciaPosiciones = 0;
  private readonly intervaloPersistenciaMs =
    Number(process.env.POSICIONES_PERSISTIR_SEG ?? '600') * 1000;

  async horarios(query: unknown): Promise<{ fuente: string; trenes: HorarioTrenResponse[] }> {
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
      return { fuente: 'cache', trenes: [] };
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

    return { fuente: 'cache', trenes };
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

      const [resultados, retrasos] = await Promise.all([
        Promise.allSettled(urls.map((url) => this.obtenerFeed(url))),
        this.obtenerRetrasos(urlRetrasos),
      ]);
      const crudas: PosicionCruda[] = [];
      for (const resultado of resultados) {
        if (resultado.status === 'fulfilled') crudas.push(...resultado.value);
      }

      const datos = aplicarRetrasos(crudas, retrasos, new Date().toISOString());
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
      for (const posicion of datos) {
        await prisma.posicionTren.upsert({
          where: { id: posicion.id },
          update: {
            numeroTren: posicion.numeroTren,
            latitud: posicion.latitud,
            longitud: posicion.longitud,
            velocidadKmh: posicion.velocidadKmh,
            retrasoSeg: posicion.retrasoSeg,
            actualizadaEn: ahora,
          },
          create: {
            id: posicion.id,
            numeroTren: posicion.numeroTren,
            latitud: posicion.latitud,
            longitud: posicion.longitud,
            velocidadKmh: posicion.velocidadKmh,
            retrasoSeg: posicion.retrasoSeg,
            actualizadaEn: ahora,
          },
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
      const hoy = new Date(ahora);
      hoy.setHours(0, 0, 0, 0);
      const impuntuales = datos.filter(
        (p) => p.tripId && typeof p.retrasoSeg === 'number' && p.retrasoSeg >= umbralSeg,
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
        });
        const previos = new Map(existentes.map((e) => [e.tripId, e.retrasoMaxSeg]));
        for (const [viaje, retraso] of maxPorViaje) {
          const previo = previos.get(viaje);
          if (previo === undefined) {
            const primera = impuntuales.find((p) => p.tripId === viaje);
            await prisma.impuntualidadTren
              .create({
                data: {
                  tripId: viaje,
                  vehiculoId: primera?.id ?? 'desconocido',
                  numeroTren: primera?.numeroTren ?? null,
                  fecha: hoy,
                  retrasoMaxSeg: retraso,
                },
              })
              .catch(() => undefined);
          } else if (retraso > previo) {
            await prisma.impuntualidadTren.updateMany({
              where: { tripId: viaje, fecha: hoy },
              data: { retrasoMaxSeg: retraso },
            });
          }
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

  async puntualidadMes(mes?: string, orden?: string): Promise<PuntualidadTrenResponse[]> {
    let desde: Date;
    let hasta: Date;
    if (mes && /^\d{4}-\d{2}$/.test(mes)) {
      const anio = Number(mes.slice(0, 4));
      const mesNum = Number(mes.slice(5, 7));
      desde = new Date(Date.UTC(anio, mesNum - 1, 1));
      hasta = new Date(Date.UTC(anio, mesNum, 1));
    } else {
      const ahora = new Date();
      desde = new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth(), 1));
      hasta = new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth() + 1, 1));
    }
    const filas = await getPrisma().impuntualidadTren.groupBy({
      by: ['vehiculoId'],
      where: { fecha: { gte: desde, lt: hasta } },
      _count: { _all: true },
      _avg: { retrasoMaxSeg: true },
      _max: { retrasoMaxSeg: true },
      _min: { numeroTren: true },
    });
    const resultado: PuntualidadTrenResponse[] = filas.map((f) => ({
      vehiculoId: f.vehiculoId,
      numeroTren: f._min.numeroTren,
      vecesImpuntuales: f._count._all,
      retrasoMedioSeg: Math.round(f._avg.retrasoMaxSeg ?? 0),
      retrasoMaxSeg: f._max.retrasoMaxSeg ?? 0,
    }));

    // Enriquecer con el trayecto y horario habitual de sus servicios impuntuales
    try {
      const servicios = await getPrisma().impuntualidadTren.findMany({
        where: { fecha: { gte: desde, lt: hasta } },
        select: { vehiculoId: true, numeroTren: true, tripId: true, fecha: true },
      });
      const numeros = new Set<string>();
      for (const s of servicios) {
        if (s.numeroTren) numeros.add(s.numeroTren);
        numeros.add(prefijoTripId(s.tripId));
      }
      if (numeros.size > 0) {
        const horarios = await getPrisma().horarioTren.findMany({
          where: { numeroTren: { in: [...numeros] }, fecha: { gte: desde, lt: hasta } },
          select: {
            numeroTren: true,
            fecha: true,
            salida: true,
            origen: { select: { nombre: true } },
            destino: { select: { nombre: true } },
          },
        });
        const porClave = new Map(
          horarios.map((h) => [`${h.numeroTren}|${h.fecha.toISOString().slice(0, 10)}`, h]),
        );
        const trayectosPorVehiculo = new Map<
          string,
          Map<
            string,
            { cuenta: number; origen: string; destino: string; salida: string; fecha: string }
          >
        >();
        for (const s of servicios) {
          const dia = s.fecha.toISOString().slice(0, 10);
          const horario =
            porClave.get(`${s.numeroTren ?? ''}|${dia}`) ??
            porClave.get(`${prefijoTripId(s.tripId)}|${dia}`);
          if (!horario) continue;
          const clave = `${horario.origen.nombre}→${horario.destino.nombre}|${horaGtfs(horario.salida.toISOString())}`;
          const porVehiculo = trayectosPorVehiculo.get(s.vehiculoId) ?? new Map();
          const previo = porVehiculo.get(clave);
          porVehiculo.set(
            clave,
            previo
              ? { ...previo, cuenta: previo.cuenta + 1 }
              : {
                  cuenta: 1,
                  origen: horario.origen.nombre,
                  destino: horario.destino.nombre,
                  salida: horaGtfs(horario.salida.toISOString()),
                  fecha: dia,
                },
          );
          trayectosPorVehiculo.set(s.vehiculoId, porVehiculo);
        }
        for (const fila of resultado) {
          const mejor = [...(trayectosPorVehiculo.get(fila.vehiculoId)?.values() ?? [])].sort(
            (a, b) => b.cuenta - a.cuenta,
          )[0];
          if (mejor) {
            fila.origenNombre = mejor.origen;
            fila.destinoNombre = mejor.destino;
            fila.salida = mejor.salida;
            fila.fecha = mejor.fecha;
          }
        }
      }
    } catch (error) {
      this.logger.warn(`No se pudo enriquecer la puntualidad: ${String(error)}`);
    }

    if (orden === 'impuntualidad') {
      resultado.sort((a, b) => b.retrasoMedioSeg - a.retrasoMedioSeg);
    } else {
      resultado.sort((a, b) => b.vecesImpuntuales - a.vecesImpuntuales);
    }
    return resultado.slice(0, 100);
  }

  private async obtenerRetrasos(url: string): Promise<Map<string, number>> {
    const urls = url
      .split(',')
      .map((u) => u.trim())
      .filter(Boolean);
    const resultados = await Promise.allSettled(urls.map((u) => this.descargarRetrasos(u)));
    const retrasos = new Map<string, number>();
    for (const [i, resultado] of resultados.entries()) {
      if (resultado.status === 'rejected') {
        this.logger.warn(
          `No se pudieron obtener retrasos GTFS-RT (${urls[i]}): ${String(resultado.reason)}`,
        );
        continue;
      }
      for (const [clave, delay] of resultado.value) {
        const previo = retrasos.get(clave);
        if (previo === undefined || delay > previo) retrasos.set(clave, delay);
      }
    }
    return retrasos;
  }

  private async descargarRetrasos(url: string): Promise<Map<string, number>> {
    const controlador = new AbortController();
    const timeout = setTimeout(() => controlador.abort(), 8_000);
    try {
      const respuesta = await fetch(url, {
        signal: controlador.signal,
        headers: { accept: 'application/json' },
      });
      if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);
      return parsearRetrasos(await respuesta.json());
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
