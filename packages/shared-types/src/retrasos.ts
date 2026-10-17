import { prefijoTripId } from './gtfs-rt';
import type { PosicionTrenResponse } from './dto/trenes';

export interface PosicionCruda {
  id: string;
  numeroTren: string | null;
  latitud: number;
  longitud: number;
  velocidadKmh: number | null;
  tripId: string | null;
}

export function aplicarRetrasos(
  posiciones: PosicionCruda[],
  retrasos: ReadonlyMap<string, number>,
  actualizadaEn: string,
  cancelados: ReadonlySet<string> = new Set(),
): PosicionTrenResponse[] {
  // El feed de Larga Distancia repite el mismo vehículo con sub-trips distintos
  // (p.ej. 041931... y 041932...): en el mapa va una sola vez.
  const porVehiculo = new Map<string, PosicionCruda>();
  for (const posicion of posiciones) porVehiculo.set(posicion.id, posicion);

  return [...porVehiculo.values()].map(({ tripId, ...posicion }) => ({
    ...posicion,
    tripId,
    retrasoSeg: tripId !== null ? (retrasos.get(prefijoTripId(tripId)) ?? null) : null,
    cancelado: tripId !== null && cancelados.has(prefijoTripId(tripId)),
    actualizadaEn,
  }));
}
