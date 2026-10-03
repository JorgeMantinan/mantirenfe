import type { TFunction } from 'i18next';

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
