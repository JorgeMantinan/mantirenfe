import { prefijoTripId, type PosicionTrenResponse } from '@mantirenfe/shared-types';

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
): PosicionTrenResponse[] {
  // El feed de Larga Distancia repite el mismo vehículo con sub-trips distintos
  // (p.ej. 041931... y 041932...): en el mapa va una sola vez.
  const porVehiculo = new Map<string, PosicionCruda>();
  for (const posicion of posiciones) porVehiculo.set(posicion.id, posicion);

  return [...porVehiculo.values()].map(({ tripId, ...posicion }) => ({
    ...posicion,
    tripId,
    retrasoSeg: tripId !== null ? (retrasos.get(prefijoTripId(tripId)) ?? null) : null,
    actualizadaEn,
  }));
}
