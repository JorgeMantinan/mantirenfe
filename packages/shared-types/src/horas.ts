/**
 * Conversión de las horas "franja" (`Alerta.horaDesde`/`horaHasta`,
 * `PrecioTren.salida`), que en la BD son columnas `@db.Time` de Postgres.
 *
 * Postgres `TIME` se mapea en Prisma a un `Date` JS cuya fecha de referencia
 * es 1970-01-01 y cuyas horas/minutos se codifican en **UTC** (el motor
 * convierte el NaiveTime a `1970-01-01T…Z` y las conexiones de Prisma trabajan
 * con `TimeZone = UTC`). De ahí las dos reglas de esta capa:
 *
 *  - AL ESCRIBIR: `'17:30'` → `new Date('1970-01-01T17:30:00.000Z')`.
 *  - AL LEER: `getUTCHours()`/`getUTCMinutes()` (nunca `getHours()`: dependería
 *    de la zona del proceso).
 *
 * El resto de la aplicación sigue trabajando con texto `'HH:MM'` (los DTO
 * `AlertaResponse.horaDesde` y `PuntoPrecio.salida` NO cambian): la conversión
 * ocurre en el borde de Prisma, en las dos direcciones.
 *
 * `horaComoTexto` admite también un string (ISO o `'HH:MM'`) para poder leer
 * en frío los mocks de los tests y los estados guardados por versiones
 * anteriores.
 */

const HORA_HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Valor tal y como puede llegar de una fila de Prisma o de un formulario. */
export type HoraEntrada = Date | string | null | undefined;

/**
 * Normaliza una hora al texto `'HH:MM'` con el que trabaja toda la app.
 * Devuelve `null` si no viene o si el valor no es reconocible.
 */
export function horaComoTexto(hora: HoraEntrada): string | null {
  if (hora === null || hora === undefined || hora === '') return null;
  if (hora instanceof Date) {
    if (Number.isNaN(hora.getTime())) return null;
    const h = String(hora.getUTCHours()).padStart(2, '0');
    const m = String(hora.getUTCMinutes()).padStart(2, '0');
    return `${h}:${m}`;
  }
  // Un ISO completo ('2026-10-05T07:35:00.000Z') también se reduce a HH:MM,
  // igual que hace `horaGtfs` con las salidas de los trenes.
  const hhmm = hora.length > 5 ? hora.slice(11, 16) : hora;
  return HORA_HHMM.test(hhmm) ? hhmm : null;
}

/**
 * `'HH:MM'` → `Date` para escribir una columna `@db.Time` **nullable**
 * (`Alerta.horaDesde`/`horaHasta`). Formato no reconocible → `null`.
 */
export function horaATime(hora: string | null | undefined): Date | null {
  const hhmm = horaComoTexto(hora);
  return hhmm === null ? null : new Date(`1970-01-01T${hhmm}:00.000Z`);
}

/**
 * Igual que {@link horaATime} pero para columnas `@db.Time` **NO NULL**
 * (`PrecioTren.salida`): un valor ausente o ilegible se guarda como
 * medianoche en vez de romper el INSERT.
 */
export function horaATimeNoNula(hora: string | null | undefined): Date {
  return horaATime(hora) ?? new Date('1970-01-01T00:00:00.000Z');
}

/**
 * Minutos desde medianoche de una hora (`'17:30'` o `Date` de columna `TIME`);
 * `null` si no viene o no vale. Comparar minutos no depende del formato, aunque
 * con `'HH:MM'` cero-rellenado el orden lexicográfico ya es el mismo.
 */
export function horaAMinutos(hora: HoraEntrada): number | null {
  const hhmm = horaComoTexto(hora);
  if (hhmm === null) return null;
  return Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
}
