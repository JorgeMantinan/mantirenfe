export interface FeedTripUpdatesCrudo {
  entity?: Array<{
    tripUpdate?: {
      trip?: { tripId?: string };
      delay?: number;
      stopTimeUpdate?: Array<{
        arrival?: { delay?: number };
        departure?: { delay?: number };
      }>;
    };
  }>;
}

function segundosLimpios(valor: unknown): number | null {
  return typeof valor === 'number' && Number.isFinite(valor) ? Math.round(valor) : null;
}

/**
 * Extrae el retraso en segundos por tripId de un feed GTFS-RT de trip updates.
 * Prioriza `tripUpdate.delay` y, si no viene, el máximo de los delays de paradas.
 * Si se pasa `soloTripIds`, solo se devuelven esos viajes.
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
    if (soloTripIds && !soloTripIds.has(tripId)) continue;

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
    if (delay !== null) retrasos.set(tripId, delay);
  }
  return retrasos;
}
