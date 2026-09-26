import type { PosicionTrenResponse } from '@mantirenfe/shared-types';

export interface HorarioActivo {
  numeroTren: string;
  origenNombre: string;
  destinoNombre: string;
  salida: Date;
  llegada: Date;
  operador: string | null;
}

const MARGEN_LLEGADA_MS = 45 * 60_000;

/**
 * Cruza las posiciones en vivo con los horarios de la BD para añadir de dónde
 * va cada tren (origen/destino/salida/llegada/operador).
 *
 * Regla: si el tren está "en vuelo" (salida <= ahora <= llegada + margen de
 * retraso), se usa ese trayecto; si no, el horario cuya salida más se acerque
 * a ahora (servicios nocturnos o en patio).
 */
export function enriquecerPosiciones(
  posiciones: PosicionTrenResponse[],
  horarios: HorarioActivo[],
  ahora: Date,
): PosicionTrenResponse[] {
  if (horarios.length === 0) return posiciones;

  const porTren = new Map<string, HorarioActivo[]>();
  for (const horario of horarios) {
    const lista = porTren.get(horario.numeroTren);
    if (lista) lista.push(horario);
    else porTren.set(horario.numeroTren, [horario]);
  }

  return posiciones.map((posicion) => {
    // Match por label del vehículo (Larga Distancia) o por tripId (Cercanías)
    const candidatos =
      (posicion.numeroTren ? porTren.get(posicion.numeroTren) : undefined) ??
      (posicion.tripId ? porTren.get(posicion.tripId) : undefined);
    if (!candidatos || candidatos.length === 0) return posicion;

    const enVuelo = candidatos.filter(
      (h) =>
        h.salida.getTime() <= ahora.getTime() &&
        ahora.getTime() <= h.llegada.getTime() + MARGEN_LLEGADA_MS,
    );
    const conjunto = enVuelo.length > 0 ? enVuelo : candidatos;
    const elegido = conjunto.reduce((mejor, h) =>
      Math.abs(h.salida.getTime() - ahora.getTime()) <
      Math.abs(mejor.salida.getTime() - ahora.getTime())
        ? h
        : mejor,
    );

    return {
      ...posicion,
      origenNombre: elegido.origenNombre,
      destinoNombre: elegido.destinoNombre,
      salida: elegido.salida.toISOString(),
      llegada: elegido.llegada.toISOString(),
      operador: elegido.operador,
    };
  });
}
