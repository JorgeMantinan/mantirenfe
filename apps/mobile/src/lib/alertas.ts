import { crearAlertaSchema, DIAS_LABORABLES } from '@mantirenfe/shared-types';
import { t } from '../i18n';

export function validarAlerta(datos: unknown) {
  return crearAlertaSchema.safeParse(datos);
}

/**
 * Payload de la alerta de vuelta: la misma alerta con los extremos invertidos.
 * Función pura (no muta la entrada) y genérica: solo exige los dos campos que
 * sí cambian, el resto (fecha, criterio, franja, bono, notas...) se copia tal cual.
 */
export function construirAlertaVuelta<T extends { origenNombre: string; destinoNombre: string }>(
  datos: T,
): T {
  return { ...datos, origenNombre: datos.destinoNombre, destinoNombre: datos.origenNombre };
}

export function etiquetaBono(bono: string): string {
  switch (bono) {
    case 'GENERAL':
      return t('alertas.bono.GENERAL');
    case 'BONO_10':
      return t('alertas.bono.BONO_10');
    case 'BONO_20':
      return t('alertas.bono.BONO_20');
    case 'JUVENIL':
      return t('alertas.bono.JUVENIL');
    case 'ESTUDIANTE':
      return t('alertas.bono.ESTUDIANTE');
    case 'DISCAPACIDAD':
      return t('alertas.bono.DISCAPACIDAD');
    case 'FAMILIA_NUMEROSA':
      return t('alertas.bono.FAMILIA_NUMEROSA');
    case 'MAYOR_60':
      return t('alertas.bono.MAYOR_60');
    case 'OTRO':
      return t('alertas.bono.OTRO');
    default:
      return bono;
  }
}

export function etiquetaEstado(estado: string): string {
  switch (estado) {
    case 'ACTIVA':
      return t('alertas.estado.ACTIVA');
    case 'PAUSA':
      return t('alertas.estado.PAUSA');
    case 'COMPLETADA':
      return t('alertas.estado.COMPLETADA');
    default:
      return estado;
  }
}

/** Criterio de la alerta en texto legible ("Plazas libres" en vez de "DISPONIBILIDAD"). */
export function etiquetaCriterio(criterio: string): string {
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

/** Recuento histórico de la alerta: "3 avisos" (singular con 1). */
export function etiquetaAvisos(total: number): string {
  return `${total} ${total === 1 ? t('alertas.aviso') : t('alertas.avisos')}`;
}

/**
 * Frecuencia de la alerta en texto corto para la etiqueta: "Cada día" si no
 * hay días marcados (o están los 7), "L-V" si son los laborables y, para el
 * resto, los días sueltos ("Jue" con uno solo, "L, X, V" con varios).
 *
 * `diasSemana` usa el formato JS `getUTCDay` (0 = domingo … 6 = sábado).
 */
export function etiquetaDiasSemana(dias: readonly number[]): string {
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
