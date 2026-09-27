export interface FeedTripUpdatesCrudo {
  entity?: Array<{
    tripUpdate?: {
      trip?: { tripId?: string; scheduleRelationship?: string };
      delay?: number;
      stopTimeUpdate?: Array<{
        arrival?: { delay?: number };
        departure?: { delay?: number };
        stopId?: string;
        scheduleRelationship?: string;
      }>;
    };
  }>;
}

function segundosLimpios(valor: unknown): number | null {
  return typeof valor === 'number' && Number.isFinite(valor) ? Math.round(valor) : null;
}

const RE_FECHA_FINAL = /\d{4}-\d{2}-\d{2}$/;

/**
 * Los feeds de Larga Distancia (AV/LD/MD) usan tripIds tipo `1309512026-09-23`
 * (número de tren + fecha). Devuelve el tripId sin la fecha final para poder
 * cruzarlo con `numeroTren`; cualquier otro tripId se devuelve tal cual.
 */
export function prefijoTripId(tripId: string): string {
  const coincidencia = RE_FECHA_FINAL.exec(tripId);
  if (!coincidencia || coincidencia.index === 0) return tripId;
  return tripId.slice(0, coincidencia.index);
}

function matchNumero(clave: string, candidatos: ReadonlySet<string>): string | null {
  if (!/^\d+$/.test(clave)) return null;
  for (const candidato of candidatos) {
    if (candidato.length >= clave.length) continue;
    if (!/^\d+$/.test(candidato)) continue;
    if (!clave.startsWith(candidato)) continue;
    if (/^\d+$/.test(clave.slice(candidato.length))) return candidato;
  }
  return null;
}

function resolverClave(tripId: string, soloTripIds?: ReadonlySet<string>): string | null {
  const clave = prefijoTripId(tripId);
  if (!soloTripIds) return clave;
  if (soloTripIds.has(clave)) return clave;
  if (soloTripIds.has(tripId)) return tripId;
  return matchNumero(clave, soloTripIds);
}

/**
 * Extrae el retraso en segundos por tripId de un feed GTFS-RT de trip updates.
 * Prioriza `tripUpdate.delay` y, si no viene, el máximo de los delays de paradas.
 * Si se pasa `soloTripIds`, solo se devuelven esos viajes (aceptando también el
 * tripId de Larga Distancia con fecha, p.ej. `1309512026-09-23` → `13095`).
 */
export function parsearRetrasos(
  feed: unknown,
  soloTripIds?: ReadonlySet<string>,
): Map<string, number> {
  const retrasos = new Map<string, number>();
  const entidades = (feed as FeedTripUpdatesCrudo | null)?.entity;
  if (!Array.isArray(entidades)) return retrasos;

  for (const entidad of entidades) {
    const tripId = entidad.tripUpdate?.trip?.tripId;
    if (!tripId) continue;

    const clave = resolverClave(tripId, soloTripIds);
    if (clave === null) continue;

    let delay = segundosLimpios(entidad.tripUpdate?.delay);
    if (delay === null) {
      const candidatos: number[] = [];
      for (const parada of entidad.tripUpdate?.stopTimeUpdate ?? []) {
        const llegada = segundosLimpios(parada.arrival?.delay);
        const salida = segundosLimpios(parada.departure?.delay);
        if (llegada !== null) candidatos.push(llegada);
        if (salida !== null) candidatos.push(salida);
      }
      if (candidatos.length > 0) delay = Math.max(...candidatos);
    }
    if (delay !== null) retrasos.set(clave, delay);
  }
  return retrasos;
}

const RELACION_HORARIO_CANCELADO = 'CANCELED';
const RELACION_PARADA_SALTADA = 'SKIPPED';

export function parsearCancelados(feed: unknown, soloTripIds?: ReadonlySet<string>): Set<string> {
  const cancelados = new Set<string>();
  const entidades = (feed as FeedTripUpdatesCrudo | null)?.entity;
  if (!Array.isArray(entidades)) return cancelados;

  for (const entidad of entidades) {
    const trip = entidad.tripUpdate?.trip;
    if (trip?.scheduleRelationship !== RELACION_HORARIO_CANCELADO) continue;
    if (!trip.tripId) continue;
    const clave = resolverClave(trip.tripId, soloTripIds);
    if (clave !== null) cancelados.add(clave);
  }
  return cancelados;
}

/** Paradas (stopId GTFS = `Estacion.codigo`) que un viaje no va a hacer hoy. */
export interface ParadaSuprimida {
  tripId: string;
  stopIds: string[];
}

/**
 * Extrae las paradas suprimidas (`stopTimeUpdate[].scheduleRelationship: "SKIPPED"`)
 * por viaje. En el feed real de Cercanías cada parada SKIPPED lleva `stopId` pero
 * NO `stopSequence` (ni arrival/departure), así que el orden hay que deducirlo del
 * propio array. Larga Distancia hoy no publica SKIPPED: devuelve vacío.
 * `tripId` es la clave ya normalizada (igual que en `parsearRetrasos`/`parsearCancelados`).
 */
export function parsearParadasSuprimidas(
  feed: unknown,
  soloTripIds?: ReadonlySet<string>,
): ParadaSuprimida[] {
  const resultado = new Map<string, string[]>();
  const entidades = (feed as FeedTripUpdatesCrudo | null)?.entity;
  if (!Array.isArray(entidades)) return [];

  for (const entidad of entidades) {
    const tripId = entidad.tripUpdate?.trip?.tripId;
    if (!tripId) continue;
    const stopTimeUpdates = entidad.tripUpdate?.stopTimeUpdate;
    if (!Array.isArray(stopTimeUpdates)) continue;

    let clave: string | null = null;
    const stopIds: string[] = [];
    for (const parada of stopTimeUpdates) {
      if (parada?.scheduleRelationship !== RELACION_PARADA_SALTADA) continue;
      if (!parada.stopId) continue;
      clave ??= resolverClave(tripId, soloTripIds);
      if (clave === null) break;
      if (!stopIds.includes(parada.stopId)) stopIds.push(parada.stopId);
    }
    if (clave === null || stopIds.length === 0) continue;

    const previos = resultado.get(clave) ?? [];
    for (const stopId of stopIds) if (!previos.includes(stopId)) previos.push(stopId);
    resultado.set(clave, previos);
  }

  return [...resultado].map(([clave, stopIds]) => ({ tripId: clave, stopIds }));
}
