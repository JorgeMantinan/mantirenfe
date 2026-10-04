import { DIAS_LABORABLES } from '@mantirenfe/shared-types';
import type { TFunction } from 'i18next';

/**
 * Payload de la alerta de vuelta: la misma alerta con los extremos invertidos.
 * Pura (no toca el original) y genérica para no acoplar la página a un tipo
 * concreto: solo exige los dos campos que sí cambian.
 */
export function construirAlertaVuelta<T extends { origenNombre: string; destinoNombre: string }>(
  datos: T,
): T {
  return { ...datos, origenNombre: datos.destinoNombre, destinoNombre: datos.origenNombre };
}

/**
 * Criterio de la alerta en texto legible ("Plazas libres" en vez de
 * "DISPONIBILIDAD"). El código cruido solo se pinta si no lo conocemos, para
 * que una alerta con un criterio de otra versión no salga vacía.
 */
export function etiquetaCriterio(t: TFunction, criterio: string): string {
  switch (criterio) {
    case 'DISPONIBILIDAD':
      return t('alertas.criterio.DISPONIBILIDAD');
    case 'RETRASO':
      return t('alertas.criterio.RETRASO');
    case 'HORARIO':
      return t('alertas.criterio.HORARIO');
    case 'APERTURA_VENTA':
      return t('alertas.criterio.APERTURA_VENTA');
    case 'PRECIO':
      return t('alertas.criterio.PRECIO');
    default:
      return criterio;
  }
}

/**
 * Frecuencia de la alerta en texto corto para el badge: "Cada día" si no hay
 * días marcados (o están los 7), "L-V" si son los laborables y, para el resto,
 * los días sueltos ("Jue" con uno solo, "L, X, V" con varios).
 *
 * `diasSemana` usa el formato JS `getUTCDay` (0 = domingo … 6 = sábado).
 */
export function etiquetaDiasSemana(t: TFunction, dias: readonly number[]): string {
  const unicos = [...new Set(dias)]
    .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
    .sort((a, b) => a - b);
  if (unicos.length === 0 || unicos.length === 7) return t('alertas.diasTodos');
  if (
    unicos.length === DIAS_LABORABLES.length &&
    DIAS_LABORABLES.every((d) => unicos.includes(d))
  ) {
    return t('alertas.diasLaborables');
  }
  const iniciales = t('comunes.diasIniciales').split(',');
  if (unicos.length === 1) {
    const dia = unicos[0];
    const cortos = t('comunes.diasCortos').split(',');
    return (dia !== undefined ? cortos[dia] : undefined) ?? String(dia);
  }
  return unicos.map((d) => iniciales[d] ?? String(d)).join(', ');
}
