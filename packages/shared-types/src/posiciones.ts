import { fechaGtfs, type PosicionTrenResponse } from './dto/trenes';
import { parsearCancelados, parsearRetrasos } from './gtfs-rt';
import { aplicarRetrasos, type PosicionCruda } from './retrasos';

/**
 * Cadena de posiciones GTFS-RT sin pasar por HTTP del API: feeds de vehículos
 * + trip updates → `aplicarRetrasos` → (quien llame persiste/enseña).
 *
 * La comparten dos procesos con presupuestos distintos:
 *  - el API (`GET /trenes/posiciones`, NestJS, con caché y enriquecimiento);
 *  - el snapshot programado del worker en GitHub Actions
 *    (`apps/worker/scripts/snapshot-posiciones.ts`), que persiste directo en
 *    la BD para que la historia de traza/puntualidad siga fluyendo aunque el
 *    API de Render esté dormido (el plan free duerme tras 15 min sin tráfico).
 */

export interface TripUpdates {
  retrasos: Map<string, number>;
  cancelados: Set<string>;
}

const URLS_POSICIONES_DEFECTO =
  'https://gtfsrt.renfe.com/vehicle_positions.json,https://gtfsrt.renfe.com/vehicle_positions_LD.json';
const URLS_TRIP_UPDATES_DEFECTO =
  'https://gtfsrt.renfe.com/trip_updates.json,https://gtfsrt.renfe.com/trip_updates_LD.json';

async function descargarJson(url: string): Promise<unknown> {
  const controlador = new AbortController();
  const timeout = setTimeout(() => controlador.abort(), 8_000);
  try {
    const respuesta = await fetch(url, {
      signal: controlador.signal,
      headers: { accept: 'application/json' },
    });
    if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);
    return await respuesta.json();
  } finally {
    clearTimeout(timeout);
  }
}

/** Parsea un feed `vehicle_positions.json` a posiciones crudas. */
export function posicionesDeFeed(feed: unknown): PosicionCruda[] {
  const cuerpo = feed as {
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
  for (const entity of cuerpo.entity ?? []) {
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
}

export async function descargarPosiciones(url: string): Promise<PosicionCruda[]> {
  return posicionesDeFeed(await descargarJson(url));
}

export async function descargarTripUpdates(url: string): Promise<TripUpdates> {
  const feed = await descargarJson(url);
  return {
    retrasos: parsearRetrasos(feed),
    cancelados: parsearCancelados(feed),
  };
}

/** Combina varios feeds de trip updates: máximo delay por clave, unión de cancelados. */
export async function combinarTripUpdates(
  urlLista: string,
  aviso?: (mensaje: string) => void,
): Promise<TripUpdates> {
  const urls = urlLista
    .split(',')
    .map((u) => u.trim())
    .filter(Boolean);
  const resultados = await Promise.allSettled(urls.map((u) => descargarTripUpdates(u)));
  const retrasos = new Map<string, number>();
  const cancelados = new Set<string>();
  for (const [i, resultado] of resultados.entries()) {
    if (resultado.status === 'rejected') {
      aviso?.(
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

/**
 * Posiciones actuales con retraso/cancelación aplicados, SIN enriquecer con
 * horarios (lo que persiste no lo necesita) y sin caché. Un feed caído no
 * tira el resto (allSettled); solo avisa.
 */
export async function obtenerPosicionesRetrasadas(opciones?: {
  aviso?: (mensaje: string) => void;
}): Promise<PosicionTrenResponse[]> {
  const urls = (process.env.GTFS_RT_URLS ?? URLS_POSICIONES_DEFECTO)
    .split(',')
    .map((u) => u.trim())
    .filter(Boolean);
  const urlRetrasos = process.env.GTFS_RT_TRIP_UPDATES_URL?.trim() ?? URLS_TRIP_UPDATES_DEFECTO;

  const [resultados, tripUpdates] = await Promise.all([
    Promise.allSettled(urls.map((u) => descargarPosiciones(u))),
    combinarTripUpdates(urlRetrasos, opciones?.aviso),
  ]);
  const crudas: PosicionCruda[] = [];
  for (const [i, resultado] of resultados.entries()) {
    if (resultado.status === 'fulfilled') crudas.push(...resultado.value);
    else
      opciones?.aviso?.(
        `No se pudo obtener el feed de posiciones (${urls[i]}): ${String(resultado.reason)}`,
      );
  }
  return aplicarRetrasos(
    crudas,
    tripUpdates.retrasos,
    new Date().toISOString(),
    tripUpdates.cancelados,
  );
}

/** Techo de retraso admisible al registrar impuntualidad: 6 h (21.600 s).
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

interface FilaSnapshotPosicion {
  id: string;
  numeroTren: string | null;
  latitud: number;
  longitud: number;
  velocidadKmh: number | null;
  retrasoSeg: number | null;
  actualizadaEn: Date;
}

interface FilaHistorialPosicion {
  vehiculoId: string;
  tripId: string | null;
  numeroTren: string | null;
  latitud: number;
  longitud: number;
  retrasoSeg: number | null;
  en: Date;
}

/**
 * Pedidos mínimos a la BD para persistir un snapshot (Prisma real o un doble).
 * Es el mismo subconjunto que usa el API; si Prisma lo cumple, se pasa `prisma`.
 */
export interface BasePersistenciaPosiciones {
  posicionTren: {
    // Un único `where` con filtros opcionales (union+genérico de Prisma no
    // conviven: el `T extends DeleteManyArgs` se instanciaba con la 1ª rama).
    deleteMany(args: {
      where: { id?: { in: string[] }; actualizadaEn?: { lt: Date } };
    }): Promise<{ count: number }>;
    createMany(args: {
      data: FilaSnapshotPosicion[];
      skipDuplicates?: boolean;
    }): Promise<{ count: number }>;
    // Opcional (los dobles de test no lo llevan): frescura del último
    // snapshot para el throttle de escrituras (Disk IO).
    findFirst?(args: {
      orderBy: { actualizadaEn: 'desc' };
      select: { actualizadaEn: true };
    }): Promise<{ actualizadaEn: Date } | null>;
  };
  posicionHistorial: {
    createMany(args: { data: FilaHistorialPosicion[] }): Promise<{ count: number }>;
    deleteMany(args: { where: { en: { lt: Date } } }): Promise<{ count: number }>;
  };
  impuntualidadTren: {
    findMany(args: {
      where: { fecha: Date; tripId: { in: string[] } };
      select: { tripId: true; retrasoMaxSeg: true };
      take: number;
    }): Promise<Array<{ tripId: string; retrasoMaxSeg: number }>>;
    createMany(args: {
      data: Array<{
        tripId: string;
        vehiculoId: string;
        numeroTren: string | null;
        fecha: Date;
        retrasoMaxSeg: number;
      }>;
      skipDuplicates?: boolean;
    }): Promise<{ count: number }>;
    updateMany(args: {
      where: { fecha: Date; tripId: { in: string[] } };
      data: { retrasoMaxSeg: number };
    }): Promise<{ count: number }>;
  };
}

/**
 * Snapshot de posiciones en las tablas de estado/historial/impuntualidad.
 *
 * - `PosicionTren`: se borran los ids del snapshot y se reinsertan enteras
 *   (la tabla refleja el último snapshot con semántica de upsert; el
 *   `skipDuplicates` + PK hace seguro el delete+insert secuencial frente a
 *   otro proceso concurrente, sin necesidad de transacción).
 * - `PosicionHistorial`: un punto por tren y snapshot (la traza).
 * - `ImpuntualidadTren`: retraso máximo por servicio y día peninsular.
 * - Poda: posiciones sin verse en 24 h e historial según POSICIONES_HISTORIAL_DIAS.
 *
 * `aviso` recibe los fallos no críticos (el original solo logueaba).
 */
export async function persistirPosicionesSnapshot(
  cliente: BasePersistenciaPosiciones,
  datos: PosicionTrenResponse[],
  aviso?: (mensaje: string) => void,
): Promise<void> {
  try {
    const ahora = new Date();

    // Throttle de escrituras (presupuesto DIARIO de Disk IO de Supabase): si
    // el último snapshot es más reciente que POSICIONES_PERSISTIR_SEG (10 min
    // por defecto), no se reescribe nada. El cron de Actions corre cada 5 min:
    // sin esto reescribía estado + historial de traza + impuntualidad + sus
    // índices el DOBLE que el worker viejo (288 vs 144 snapshots al día).
    // La lectura va al índice de actualizadaEn (index-only, casi sin IO).
    const intervaloMs = Number(process.env.POSICIONES_PERSISTIR_SEG ?? '600') * 1000;
    const ultima =
      typeof cliente.posicionTren.findFirst === 'function'
        ? await cliente.posicionTren.findFirst({
            orderBy: { actualizadaEn: 'desc' },
            select: { actualizadaEn: true },
          })
        : null;
    if (ultima && ahora.getTime() - ultima.actualizadaEn.getTime() < intervaloMs) {
      aviso?.('Snapshot de posiciones omitido: el último no ha cumplido POSICIONES_PERSISTIR_SEG');
      return;
    }

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
      await cliente.posicionTren.deleteMany({ where: { id: { in: filas.map((f) => f.id) } } });
      await cliente.posicionTren.createMany({ data: filas, skipDuplicates: true });
    }

    if (datos.length > 0) {
      await cliente.posicionHistorial.createMany({
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

    const umbralSeg = Number(process.env.PUNTUALIDAD_UMBRAL_SEG ?? '300');
    // El "día" de impuntualidad es el peninsular (`fechaGtfs`): un servicio de
    // la madrugada (00:00-02:00 peninsular) no debe caer en el día UTC anterior.
    const hoy = new Date(`${fechaGtfs(ahora)}T00:00:00Z`);
    const impuntuales = datos.filter(
      (p) =>
        p.tripId &&
        typeof p.retrasoSeg === 'number' &&
        p.retrasoSeg >= umbralSeg &&
        p.retrasoSeg <= PUNTUALIDAD_RETRASO_MAX_SEG &&
        !p.numeroTren?.includes(PUNTUALIDAD_NUMERO_TREN_PLATAFORMA),
    );
    if (impuntuales.length > 0) {
      const maxPorViaje = new Map<string, number>();
      for (const p of impuntuales) {
        const viaje = p.tripId as string;
        maxPorViaje.set(viaje, Math.max(maxPorViaje.get(viaje) ?? 0, p.retrasoSeg as number));
      }
      const existentes = await cliente.impuntualidadTren.findMany({
        where: { fecha: hoy, tripId: { in: [...maxPorViaje.keys()] } },
        select: { tripId: true, retrasoMaxSeg: true },
        take: 5_000,
      });
      const previos = new Map(existentes.map((e) => [e.tripId, e.retrasoMaxSeg]));

      const aCrear: Array<{
        tripId: string;
        vehiculoId: string;
        numeroTren: string | null;
        fecha: Date;
        retrasoMaxSeg: number;
      }> = [];
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
        await cliente.impuntualidadTren.createMany({ data: aCrear, skipDuplicates: true });
      }
      for (const [retraso, viajes] of aSubir) {
        await cliente.impuntualidadTren.updateMany({
          where: { fecha: hoy, tripId: { in: viajes } },
          data: { retrasoMaxSeg: retraso },
        });
      }
    }

    await cliente.posicionTren.deleteMany({
      where: { actualizadaEn: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
    });
    const diasHistorial = Number(process.env.POSICIONES_HISTORIAL_DIAS ?? '2');
    await cliente.posicionHistorial.deleteMany({
      where: { en: { lt: new Date(Date.now() - diasHistorial * 24 * 60 * 60 * 1000) } },
    });
  } catch (error) {
    aviso?.(`No se pudieron persistir posiciones: ${String(error)}`);
  }
}
