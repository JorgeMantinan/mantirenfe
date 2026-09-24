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

    let clave = prefijoTripId(tripId);
    if (soloTripIds && !soloTripIds.has(clave)) {
      if (soloTripIds.has(tripId)) {
        clave = tripId;
      } else {
        const numero = matchNumero(clave, soloTripIds);
        if (numero === null) continue;
        clave = numero;
      }
    }

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
