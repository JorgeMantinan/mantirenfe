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
 * trabajan cada día salvo los que excluya su `diasSemana`.
 *
 * `diasSemana` es el formato canónico (0 = domingo … 6 = sábado; vacío = todos
 * los días). Las filas creadas antes de esa columna pueden traer
 * `soloLaborables = true` con `diasSemana` vacío: para ellas se mantiene la
 * lectura legada (lunes a viernes).
 *
 * OJO: el barrido ya NO filtra con esto las recurrentes CON `diasSemana`
 * marcado (esas se sondean cualquier día evaluando el próximo día marcado, ver
 * `proximoDiaAplicable` y `esPendienteDeSondeo`); aquí siguen los avisos de
 * "el día de viaje" (recordatorios, resumen y digest), que por su naturaleza
 * solo tienen sentido cuando hoy toca.
 */
export function esDiaAplicable(
  alerta: {
    recurrente?: boolean | null;
    diasSemana?: number[] | readonly number[] | null;
    soloLaborables?: boolean | null;
  },
  ahoraGtfs: Date = ahoraRelojGtfs(),
): boolean {
  if (!alerta.recurrente) return true;
  const dias = alerta.diasSemana ?? [];
  if (dias.length > 0) return dias.includes(ahoraGtfs.getUTCDay());
  if (alerta.soloLaborables) return esLaborable(ahoraGtfs);
  return true;
}

/**
 * Fecha objetivo de sondeo de una alerta: la primera fecha `>= hoyGtfs` (reloj
 * GTFS, medianoche UTC) caiga en uno de sus `diasSemana` — hoy mismo si ya
 * toca. Así una recurrente con días marcados se sondea CUALQUIER día de la
 * semana evaluando el PRÓXIMO día marcado (un martes mira el viernes) y avisa
 * en cuanto haya plaza para ese viernes/domingo.
 *
 * Sin días marcados, o si la alerta no es recurrente, la fecha objetivo es el
 * propio `hoyGtfs`: se sondea el día en curso, como siempre.
 */
export function proximoDiaAplicable(
  alerta: {
    recurrente?: boolean | null;
    diasSemana?: number[] | readonly number[] | null;
  },
  hoyGtfs: Date,
): Date {
  if (!alerta.recurrente) return hoyGtfs;
  const dias = alerta.diasSemana ?? [];
  if (dias.length === 0) return hoyGtfs;
  let candidata = new Date(hoyGtfs.getTime());
  // Como mucho 7 pasos: la semana siempre vuelve a un día marcado (los valores
  // fuera de 0-6 no son posibles: `diasSemana` es el día de Date#getUTCDay)
  for (let i = 0; i < 7; i++) {
    if (dias.includes(candidata.getUTCDay())) return candidata;
    candidata = new Date(candidata.getTime() + 86_400_000);
  }
  return new Date(hoyGtfs.getTime()); // inalcanzable con días válidos
}
