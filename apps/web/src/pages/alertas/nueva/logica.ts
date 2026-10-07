import type { TFunction } from 'i18next';
import { etiquetaDiasSemana } from '@/lib/alertas';
import { fechaCorta } from '@/lib/proximoViaje';
import {
  horaGtfs,
  type AlertaResponse,
  type CriterioAlerta,
  type HorarioTrenResponse,
} from '@mantirenfe/shared-types';

/** Modalidades del bloque "¿Cuándo viajas?": fecha concreta, rango flexible o cotidiano. */
export type Frecuencia = 'fecha' | 'flexible' | 'diaria' | 'dias';

/** Formato HH:MM de 24 h que acepta la API (mismo que el schema de la alerta). */
export const RE_HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Todo lo que el formulario de alerta sabe en un momento dado. */
export interface EstadoFormulario {
  origen: string;
  destino: string;
  frecuencia: Frecuencia;
  fecha: string;
  dias: number[];
  horaDesde: string;
  horaHasta: string;
  criterios: CriterioAlerta[];
  conexiones: boolean;
  precioObjetivo: string;
  intervalo: number;
  bono: string;
  numeroTren: string;
  notas: string;
  tambienVuelta: boolean;
  fechaVuelta: string;
  horaDesdeVuelta: string;
  horaHastaVuelta: string;
}

/** Payload que acepta la API para crear o modificar una alerta. */
export interface DatosAlerta {
  origenNombre: string;
  destinoNombre: string;
  fechaViaje: string;
  recurrente: boolean;
  diasSemana: number[];
  fechaFlexible: boolean;
  horaDesde: string | null;
  horaHasta: string | null;
  numeroTren: string | null;
  criterio: CriterioAlerta;
  criterios: CriterioAlerta[];
  conexiones: boolean;
  precioObjetivo: number | null;
  intervaloSondeoMin: number;
  bono: string;
  notas: string | null;
}

/** Etiquetas del bono de la alerta, en el idioma activo. */
export function etiquetasBonos(t: TFunction): Record<string, string> {
  return {
    GENERAL: t('nuevaAlerta.bonoGeneral'),
    BONO_10: t('nuevaAlerta.bonoBono10'),
    BONO_20: t('nuevaAlerta.bonoBono20'),
    JUVENIL: t('nuevaAlerta.bonoJuvenil'),
    ESTUDIANTE: t('nuevaAlerta.bonoEstudiante'),
    DISCAPACIDAD: t('nuevaAlerta.bonoDiscapacidad'),
    FAMILIA_NUMEROSA: t('nuevaAlerta.bonoFamilia'),
    MAYOR_60: t('nuevaAlerta.bonoMayor60'),
    OTRO: t('nuevaAlerta.bonoOtro'),
  };
}

/** Etiquetas cortas del criterio para el resumen (los chips usan textos más largos). */
export function etiquetasCriterio(t: TFunction): Record<string, string> {
  return {
    DISPONIBILIDAD: t('nuevaAlerta.criterioPlazas'),
    RETRASO: t('nuevaAlerta.criterioRetraso'),
    HORARIO: t('nuevaAlerta.criterioHorarioCorto'),
    APERTURA_VENTA: t('nuevaAlerta.criterioVentaCorta'),
    PRECIO: t('nuevaAlerta.criterioPrecioCorto'),
  };
}

/** Etiquetas largas de los chips de criterio (los textos del antiguo select). */
export function etiquetasCriterioLargas(t: TFunction): Record<CriterioAlerta, string> {
  return {
    DISPONIBILIDAD: t('nuevaAlerta.criterioDisponibilidad'),
    HORARIO: t('nuevaAlerta.criterioHorario'),
    RETRASO: t('nuevaAlerta.criterioRetrasoTren'),
    APERTURA_VENTA: t('nuevaAlerta.criterioVenta'),
    PRECIO: t('nuevaAlerta.criterioPrecio'),
  };
}

/** Orden de los chips de criterio (multi-selección). */
export const CRITERIOS: readonly CriterioAlerta[] = [
  'DISPONIBILIDAD',
  'HORARIO',
  'RETRASO',
  'APERTURA_VENTA',
  'PRECIO',
];

/** Máximo de criterios vigilados a la vez (lo marca el schema compartido). */
export const MAX_CRITERIOS = 4;

export function frecuencias(t: TFunction): Array<{ valor: Frecuencia; etiqueta: string }> {
  return [
    { valor: 'fecha', etiqueta: t('nuevaAlerta.frecuenciaFecha') },
    { valor: 'flexible', etiqueta: t('nuevaAlerta.frecuenciaFlexible') },
    { valor: 'diaria', etiqueta: t('nuevaAlerta.frecuenciaDiaria') },
    { valor: 'dias', etiqueta: t('nuevaAlerta.frecuenciaDias') },
  ];
}

/** Modalidad a partir de lo que hay guardado en la alerta (modo edición). */
export function frecuenciaDe(alerta: AlertaResponse): Frecuencia {
  if (alerta.fechaFlexible) return 'flexible';
  if (!alerta.recurrente) return 'fecha';
  return alerta.diasSemana.length > 0 ? 'dias' : 'diaria';
}

/** Letras de los chips de días, en orden 0 = domingo … 6 = sábado. */
export function letrasDias(t: TFunction): string[] {
  return t('comunes.diasIniciales').split(',');
}

/**
 * Deja solo las salidas que aún no han salido (si no es el día de hoy no se
 * toca nada) y se queda con las 3 próximas, para pintar los chips.
 */
export function salidasFuturas(
  lista: HorarioTrenResponse[],
  fechaEfectiva: string,
  hoyIso: string,
): HorarioTrenResponse[] {
  const horaAhora = new Intl.DateTimeFormat('es-ES', {
    timeZone: 'Europe/Madrid',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date());
  const futuros = lista.filter((t) => {
    if (t.transbordo) return false;
    if (fechaEfectiva !== hoyIso) return true;
    return horaGtfs(t.salida) > horaAhora;
  });
  return futuros.slice(0, 3);
}

/**
 * Primer problema del formulario, ya traducido; `null` si todo cuadra. El
 * orden es el mismo en el que los ve el usuario al enviar.
 */
export function errorDeFormulario(e: EstadoFormulario, t: TFunction): string | null {
  if (e.origen.trim().length < 2 || e.destino.trim().length < 2) {
    return t('nuevaAlerta.errorOrigenDestino');
  }
  if (e.frecuencia === 'fecha' && !e.fecha) return t('nuevaAlerta.errorFecha');
  if (e.frecuencia === 'dias' && e.dias.length === 0) return t('nuevaAlerta.errorDias');
  if (e.tambienVuelta && !e.fechaVuelta) return t('nuevaAlerta.errorFechaVuelta');
  if (e.tambienVuelta && e.frecuencia === 'fecha' && e.fecha && e.fechaVuelta < e.fecha) {
    return t('nuevaAlerta.errorFechaVueltaOrden');
  }
  const desdeVuelta = e.horaDesdeVuelta.trim();
  const hastaVuelta = e.horaHastaVuelta.trim();
  if (e.tambienVuelta && (desdeVuelta || hastaVuelta)) {
    if (
      (desdeVuelta && !RE_HORA.test(desdeVuelta)) ||
      (hastaVuelta && !RE_HORA.test(hastaVuelta))
    ) {
      return t('nuevaAlerta.errorFranjaVuelta');
    }
    if (desdeVuelta && hastaVuelta && desdeVuelta > hastaVuelta) {
      return t('nuevaAlerta.errorFranjaVueltaOrden');
    }
  }
  if (e.criterios.length === 0) return t('nuevaAlerta.errorSinCriterio');
  if (e.criterios.length > MAX_CRITERIOS) return t('nuevaAlerta.errorMaxCriterios');
  if (e.criterios.includes('PRECIO')) {
    const objetivo = Number(e.precioObjetivo);
    if (!(Number.isFinite(objetivo) && objetivo > 0)) return t('nuevaAlerta.errorPrecio');
  }
  return null;
}

/** Payload de la API a partir del formulario (`fechaEfectiva` ya resuelta). */
export function datosDeAlerta(e: EstadoFormulario, fechaEfectiva: string): DatosAlerta {
  const recurrente = e.frecuencia === 'diaria' || e.frecuencia === 'dias';
  const flexible = e.frecuencia === 'flexible';
  const objetivo = Number(e.precioObjetivo);
  return {
    origenNombre: e.origen.trim(),
    destinoNombre: e.destino.trim(),
    // Un trayecto cotidiano o "cualquier fecha" se ancla a hoy
    fechaViaje: fechaEfectiva,
    recurrente,
    // Único formato de días: vacío = todos los días
    diasSemana: recurrente ? [...e.dias].sort((a, b) => a - b) : [],
    // "Cualquier fecha en los próximos 6 meses": el worker rota el rango
    fechaFlexible: flexible,
    horaDesde: e.horaDesde || null,
    horaHasta: e.horaHasta || null,
    numeroTren: e.numeroTren.trim() || null,
    // Multi-criterio: la lista es la que vigila la alerta; `criterio` sigue
    // viajando como el primero de la lista (compatibilidad con la API vieja)
    criterio: e.criterios[0] ?? 'DISPONIBILIDAD',
    criterios: e.criterios,
    // Solo aplica con DISPONIBILIDAD vigilado: si se desmarca, el checkbox
    // se oculta y aquí se manda false (la API también lo fuerza a false)
    conexiones: e.criterios.includes('DISPONIBILIDAD') && e.conexiones,
    // Solo aplica si se vigilan precios; en el resto lo mandamos a null
    precioObjetivo: e.criterios.includes('PRECIO') ? objetivo : null,
    intervaloSondeoMin: e.intervalo,
    bono: e.bono,
    notas: e.notas.trim() || null,
  };
}

/** Resumen de la alerta: caja del formulario y texto del toast final. */
export interface ResumenAlerta {
  /** Ruta · fecha · franja · criterios, para el toast final. */
  texto: string;
  fecha: string;
  franja: string | null;
  criterio: string;
  salidas: string[];
}

/**
 * Resumen de la alerta: se recalcula con los campos actuales para poder
 * distinguir dos alertas de la misma ruta (caja del formulario + toast final).
 */
export function calcularResumen(
  e: EstadoFormulario,
  trenesSugeridos: HorarioTrenResponse[],
  t: TFunction,
): ResumenAlerta {
  const recurrente = e.frecuencia === 'diaria' || e.frecuencia === 'dias';
  const flexible = e.frecuencia === 'flexible';
  const criteriosCortos = etiquetasCriterio(t);
  const criterioEtiqueta = e.criterios.map((c) => criteriosCortos[c] ?? c).join(', ');
  const fecha = flexible
    ? t('nuevaAlerta.resumenFlexible')
    : recurrente
      ? etiquetaDiasSemana(t, e.dias)
      : e.fecha
        ? fechaCorta(e.fecha)
        : t('nuevaAlerta.resumenSinFecha');
  const franja =
    e.horaDesde || e.horaHasta ? `${e.horaDesde || '00:00'}–${e.horaHasta || '23:59'}` : null;
  const criterio = [
    criterioEtiqueta,
    e.criterios.includes('PRECIO') && e.precioObjetivo ? `≤ ${e.precioObjetivo} €` : null,
    t('alertas.cadaMin', { min: e.intervalo }),
  ]
    .filter(Boolean)
    .join(' ');
  const resumen = [
    `${e.origen.trim() || '—'} → ${e.destino.trim() || '—'}`,
    fecha,
    franja,
    criterio,
  ]
    .filter(Boolean)
    .join(' · ');
  const salidas = trenesSugeridos.slice(0, 3).map((salida) => horaGtfs(salida.salida));
  return { texto: resumen, fecha, franja, criterio, salidas };
}
