import type { PosicionTrenResponse } from '@mantirenfe/shared-types';

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
  return posiciones.map(({ tripId, ...posicion }) => ({
    ...posicion,
    retrasoSeg: tripId !== null ? (retrasos.get(tripId) ?? null) : null,
    actualizadaEn,
  }));
}
