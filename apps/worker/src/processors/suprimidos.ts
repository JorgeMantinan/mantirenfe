import type { Logger } from 'pino';
import { getPrisma } from '@mantirenfe/database';
import { parsearCancelados } from '@mantirenfe/shared-types';
import { descargarTripUpdates } from '../fuentes/gtfs-rt';
import { hoyGtfs } from './reloj';

// Mismo par de feeds que consulta la API para retrasos y cancelaciones:
// trip_updates.json (Cercanías) + trip_updates_LD.json (Larga Distancia).
const URL_TRIP_UPDATES_DEFECTO =
  'https://gtfsrt.renfe.com/trip_updates.json,https://gtfsrt.renfe.com/trip_updates_LD.json';

/** Días que se conserva una cancelación antes de podarla. */
export const DIAS_CONSERVACION = 7;

/** Minutos que se cachea el horario del día (solo lo mueve el sync GTFS). */
const TTL_HORARIO_DIA_MS = 45 * 60_000;

interface HorarioDia {
  fecha: string;
  caduca: number;
  viajes: Array<{ tripId: string | null; numeroTren: string }>;
}

let horarioDia: HorarioDia | null = null;

/** Solo para tests: la caché vive en la memoria del proceso. */
export function limpiarCacheHorarioDia(): void {
  horarioDia = null;
}

export interface CancelacionPlaneada {
  tripId: string;
  fecha: Date;
  numeroTren: string | null;
}

/**
 * Filas a upsertear para un día: tripIds ya cruzados con el horario del día
 * (claves exactas de `ParadaHorario`/`HorarioTren`) y su número de tren, que
 * se resuelve aquí porque `Cancelacion` no tiene FK al horario.
 */
export function planearCancelaciones(
  cancelados: ReadonlySet<string>,
  numeroPorTrip: ReadonlyMap<string, string | null>,
  fecha: string,
): CancelacionPlaneada[] {
  const dia = new Date(`${fecha}T00:00:00Z`);
  return [...cancelados]
    .sort()
    .map((tripId) => ({ tripId, fecha: dia, numeroTren: numeroPorTrip.get(tripId) ?? null }));
}

/** Umbral de poda: filas con `fecha` estrictamente anteriores a hoy - 7 días. */
export function limitePoda(fecha: string): Date {
  const partes = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fecha);
  if (!partes) throw new Error(`FECHA_INVALIDA_${fecha}`);
  const anio = Number(partes[1]);
  const mes = Number(partes[2]);
  const dia = Number(partes[3]);
  return new Date(Date.UTC(anio, mes - 1, dia - DIAS_CONSERVACION));
}

/**
 * Registra en la tabla `Cancelacion` los trips con `scheduleRelationship =
 * CANCELED` de los feeds GTFS-RT, poda lo anterior a 7 días y resuelve el
 * número de tren contra `HorarioTren` del día.
 *
 * Decisiones (y por qué):
 *
 * - **Fecha = día peninsular de la detección.** El feed no publica la fecha de
 *   servicio del viaje (no hay `start_date`) y la tripId embebida es la de alta
 *   del trip, no la de circulación, así que no se puede saber para qué día es.
 *   Se guarda el día en que se vio: un trip cancelado hoy puede operar mañana.
 * - **Solo trips presentes en `HorarioTren` de hoy.** `parsearCancelados` recorta
 *   la fecha final de los tripIds de Larga Distancia (`0408712026-09-28` →
 *   `040871`); pasándole los tripIds del día devuelve la clave EXACTA que usan
 *   `ParadaHorario` y `HorarioTren`. Los trips que no están en el horario de hoy
 *   se descartan (no se pueden cruzar ni filtrar por estación) y se contabilizan
 *   en el log.
 * - **Si el trip deja de estar CANCELED en el feed, la fila se MANTIENE.** El
 *   feed solo publica el estado actual; que desaparezca significa que Renfe dejó
 *   de anunciarlo (o que el viaje pasó), no que el tren llegara a salir. La fila
 *   es histórica y solo la elimina la poda por antigüedad.
 */
export async function persistirSuprimidos(logger: Logger): Promise<void> {
  const prisma = getPrisma();
  const fecha = hoyGtfs();
  const dia = new Date(`${fecha}T00:00:00Z`);

  // El horario del día solo cambia con el sync: el set de tripIds se cachea
  // (con `select` mínimo) para no traerse los HorarioTren en cada pasada
  const cacheado = horarioDia;
  const enCache = cacheado !== null && cacheado.fecha === fecha && cacheado.caduca > Date.now();
  const viajes =
    enCache && cacheado
      ? cacheado.viajes
      : await prisma.horarioTren.findMany({
          where: { fecha: dia, tripId: { not: null } },
          select: { tripId: true, numeroTren: true },
        });
  if (!enCache && viajes.length > 0) {
    // Un horario vacío no se cachea: suele significar que el sync aún no corrió
    horarioDia = { fecha, caduca: Date.now() + TTL_HORARIO_DIA_MS, viajes };
  }
  const delDia = new Set<string>();
  const numeroPorTrip = new Map<string, string | null>();
  for (const viaje of viajes) {
    if (!viaje.tripId) continue;
    delDia.add(viaje.tripId);
    numeroPorTrip.set(viaje.tripId, viaje.numeroTren);
  }
  if (delDia.size === 0) {
    logger.warn(
      { fecha },
      'Cancelaciones GTFS-RT: el horario de hoy está vacío (¿sync GTFS pendiente?), se omite',
    );
    return;
  }

  const urls = (process.env.GTFS_RT_TRIP_UPDATES_URL?.trim() || URL_TRIP_UPDATES_DEFECTO)
    .split(',')
    .map((u) => u.trim())
    .filter(Boolean);
  const resultados = await Promise.allSettled(urls.map((u) => descargarTripUpdates(u)));

  const cancelados = new Set<string>();
  let vistosEnFeed = 0;
  let feedsOk = 0;
  let ignorados = 0;
  for (const [indice, resultado] of resultados.entries()) {
    if (resultado.status === 'rejected') {
      logger.warn(
        { url: urls[indice], err: resultado.reason },
        'Cancelaciones GTFS-RT: feed no disponible',
      );
      continue;
    }
    feedsOk++;
    const feed = resultado.value;
    // Dos pasadas: sin filtro para contar lo que hay en el feed, con el horario
    // del día para quedarnos con las claves exactas (ver doc de la función).
    const enFeed = parsearCancelados(feed).size;
    const resueltas = parsearCancelados(feed, delDia);
    vistosEnFeed += enFeed;
    ignorados += Math.max(0, enFeed - resueltas.size);
    for (const tripId of resueltas) cancelados.add(tripId);
  }
  if (feedsOk === 0) {
    logger.warn('Cancelaciones GTFS-RT: ningún feed respondió, se conserva el histórico tal cual');
    return;
  }

  const filas = planearCancelaciones(cancelados, numeroPorTrip, fecha);
  let guardadas = 0;
  for (const fila of filas) {
    try {
      await prisma.cancelacion.upsert({
        where: { tripId_fecha: { tripId: fila.tripId, fecha: fila.fecha } },
        // `detectadaEn` conserva la primera detección: solo se rellena el
        // número si la fila se creó sin él (horario sincronizado después)
        update: fila.numeroTren ? { numeroTren: fila.numeroTren } : {},
        create: fila,
      });
      guardadas++;
    } catch (error) {
      logger.warn({ tripId: fila.tripId, err: error }, 'Cancelación no guardada');
    }
  }

  let podadas = 0;
  try {
    const poda = await prisma.cancelacion.deleteMany({
      where: { fecha: { lt: limitePoda(fecha) } },
    });
    podadas = poda.count;
  } catch (error) {
    logger.warn({ err: error }, 'Cancelaciones GTFS-RT: poda no completada');
  }

  logger.info(
    { fecha, enFeed: vistosEnFeed, enHorario: cancelados.size, ignorados, guardadas, podadas },
    'Cancelaciones GTFS-RT registradas',
  );
}
