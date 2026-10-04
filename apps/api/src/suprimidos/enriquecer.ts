import { fechaIso, horaGtfs, type SuprimidoResponse } from '@mantirenfe/shared-types';
import { horaDesdeMinutos } from '../common/utilidades';

// Única implementación de la conversión minutos GTFS → HH:MM (compartida con
// `trenes/puntualidad.ts`); se reexporta para no romper a sus consumidores.
export { horaDesdeMinutos };

/** Fila de `Cancelacion` ya leída de la BD. */
export interface CancelacionFila {
  tripId: string;
  numeroTren: string | null;
  fecha: Date | string;
}

/** Extremo de `HorarioTren` del día (una fila por trip + fecha). */
export interface HorarioCancelado {
  tripId: string | null;
  numeroTren: string;
  salida: Date;
  llegada: Date;
  origen: { nombre: string };
  destino: { nombre: string };
}

/** Parada de `ParadaHorario` (sin fecha) usada cuando no hay horario. */
export interface ParadaExtremo {
  tripId: string;
  orden: number;
  salidaMin: number | null;
  llegadaMin: number | null;
  estacion: { nombre: string };
}

interface Extremos {
  primera: ParadaExtremo;
  ultima: ParadaExtremo;
}

function extremosPorViaje(paradas: readonly ParadaExtremo[]): Map<string, Extremos> {
  const porViaje = new Map<string, Extremos>();
  for (const parada of paradas) {
    const previo = porViaje.get(parada.tripId);
    if (!previo) {
      porViaje.set(parada.tripId, { primera: parada, ultima: parada });
      continue;
    }
    if (parada.orden < previo.primera.orden) previo.primera = parada;
    if (parada.orden > previo.ultima.orden) previo.ultima = parada;
  }
  return porViaje;
}

/**
 * Cruza las cancelaciones del día con el horario y las paradas para devolver la
 * fila visible en web:
 *
 * - `origen`/`destino`: primera y última parada. Si hay `HorarioTren` se usan
 *   sus extremos (son los mismos que `ParadaHorario`, ya materializados con
 *   nombre); si no, se calculan con las paradas conocidas del trip.
 * - `salida`/`llegada`: de `HorarioTren` cuando existe; si no, de
 *   `ParadaHorario.salidaMin`/`llegadaMin` convertidos a `HH:MM`.
 * - `numeroTren`: el guardado al detectar la cancelación, con el del horario
 *   como red de seguridad.
 *
 * Orden: por salida (los sin hora al final) y después por tripId, para que la
 * tabla sea estable entre consultas.
 */
export function enriquecerSuprimidos(
  cancelaciones: readonly CancelacionFila[],
  horarios: readonly HorarioCancelado[],
  paradas: readonly ParadaExtremo[],
): SuprimidoResponse[] {
  const horarioPorTrip = new Map<string, HorarioCancelado>();
  for (const horario of horarios) {
    if (horario.tripId && !horarioPorTrip.has(horario.tripId)) {
      horarioPorTrip.set(horario.tripId, horario);
    }
  }
  const extremos = extremosPorViaje(paradas);

  const filas = cancelaciones.map((cancelacion): SuprimidoResponse => {
    const horario = horarioPorTrip.get(cancelacion.tripId);
    const paradasDelViaje = extremos.get(cancelacion.tripId);
    const origen = horario?.origen.nombre ?? paradasDelViaje?.primera.estacion.nombre ?? null;
    const destino = horario?.destino.nombre ?? paradasDelViaje?.ultima.estacion.nombre ?? null;
    const salida = horario
      ? horaGtfs(horario.salida.toISOString())
      : horaDesdeMinutos(paradasDelViaje?.primera.salidaMin);
    const llegada = horario
      ? horaGtfs(horario.llegada.toISOString())
      : horaDesdeMinutos(paradasDelViaje?.ultima.llegadaMin);

    return {
      tripId: cancelacion.tripId,
      numeroTren: cancelacion.numeroTren ?? horario?.numeroTren ?? null,
      fecha: fechaIso(cancelacion.fecha),
      origen,
      destino,
      salida,
      llegada,
    };
  });

  filas.sort(
    (a, b) =>
      (a.salida ?? 'zz').localeCompare(b.salida ?? 'zz') || a.tripId.localeCompare(b.tripId),
  );
  return filas;
}
