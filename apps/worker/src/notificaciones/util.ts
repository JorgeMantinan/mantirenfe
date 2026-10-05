import { preferenciaBooleana } from './preferencias';

/**
 * Lee un campo de texto de un payload `datos` (columna JSON de `Notificacion`
 * o de la marca de dedupe). Cualquier estructura que no sea un objeto plano
 * (array, primitivo, null) devuelve null: el llamante decide el fallback.
 */
export function leerTexto(datos: unknown, campo: string): string | null {
  if (datos && typeof datos === 'object' && !Array.isArray(datos)) {
    const valor = (datos as Record<string, unknown>)[campo];
    if (typeof valor === 'string') return valor;
  }
  return null;
}

/**
 * Preferencia `notificacionesPush` con el mismo criterio que la UI: por
 * defecto activa, y solo un `false` explícito la apaga. Es la lectura de
 * `preferenciaBooleana` (JSON roto, valor ausente o no booleano → default),
 * así que sondeo y resumen semanal comparten UN solo criterio.
 */
export function pushHabilitado(preferencias: unknown): boolean {
  return preferenciaBooleana(preferencias, 'notificacionesPush', true);
}
