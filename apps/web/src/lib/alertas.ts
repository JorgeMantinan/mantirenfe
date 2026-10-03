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
