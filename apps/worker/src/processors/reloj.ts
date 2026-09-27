/**
 * Hora actual en el mismo "reloj" en el que se guardan las salidas GTFS
 * (hora peninsular tratada como UTC), para poder comparar con horarioTren.salida.
 */
export function ahoraRelojGtfs(ahora: Date = new Date()): Date {
  const partes = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Madrid',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(ahora); // "2026-09-25 16:53:07"
  return new Date(`${partes.replace(' ', 'T')}Z`);
}

/** Fecha (YYYY-MM-DD) del día en el reloj peninsular. */
export function hoyGtfs(ahora: Date = new Date()): string {
  return ahoraRelojGtfs(ahora).toISOString().slice(0, 10);
}

/** `true` si es laborable (lunes a viernes) en la fecha dada (reloj GTFS). */
export function esLaborable(ahoraGtfs: Date): boolean {
  const dia = ahoraGtfs.getUTCDay(); // 0 = domingo
  return dia >= 1 && dia <= 5;
}

/**
 * ¿Toca sondear/avisar esta alerta hoy? Las no recurrentes siguen su fecha de
 * viaje (ya filtrada en SQL), así que siempre son aplicables; las recurrentes
 * trabajan cada día y, si son solo laborables, se saltan fin de semana y festivos.
 */
export function esDiaAplicable(
  alerta: { recurrente?: boolean | null; soloLaborables?: boolean | null },
  ahoraGtfs: Date = ahoraRelojGtfs(),
): boolean {
  if (!alerta.recurrente) return true;
  if (!alerta.soloLaborables) return true;
  return esLaborable(ahoraGtfs);
}
