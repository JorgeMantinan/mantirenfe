import {
  crearAlertaSchema,
  DIAS_LABORABLES,
  horaGtfs,
  type CrearAlertaInput,
  type HorarioTrenResponse,
} from '@mantirenfe/shared-types';
import { t } from '../i18n';
import { fechaCorta } from './proximoViaje';

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

// ────────────────────────────────────────────── Formulario de nueva alerta

/** Criterios vigilados que admite el formulario (orden en el que se pintan). */
export const CRITERIOS = [
  'DISPONIBILIDAD',
  'RETRASO',
  'HORARIO',
  'APERTURA_VENTA',
  'PRECIO',
] as const;

export type Criterio = (typeof CRITERIOS)[number];

/** Máximo de criterios vigilados a la vez (lo marca el schema compartido). */
export const MAX_CRITERIOS = 4;

/** Modalidades de «cuándo»: fecha, cualquier fecha, diaria o días sueltos. */
export const FRECUENCIAS = ['fecha', 'flexible', 'diaria', 'dias'] as const;

export type Frecuencia = (typeof FRECUENCIAS)[number];

/** Modalidad a partir de lo que hay guardado en la alerta (modo edición). */
export function frecuenciaDe(alerta: {
  recurrente: boolean;
  diasSemana: number[];
  fechaFlexible: boolean;
}): Frecuencia {
  if (alerta.fechaFlexible) return 'flexible';
  if (!alerta.recurrente) return 'fecha';
  return alerta.diasSemana.length > 0 ? 'dias' : 'diaria';
}

/** Etiqueta de cada criterio en el formulario (claves `nueva.criterio.*`). */
export function etiquetasDeCriterios(): Record<Criterio, string> {
  return {
    DISPONIBILIDAD: t('nueva.criterio.disponibilidad'),
    RETRASO: t('nueva.criterio.retraso'),
    HORARIO: t('nueva.criterio.horario'),
    APERTURA_VENTA: t('nueva.criterio.aperturaVenta'),
    PRECIO: t('nueva.criterio.precio'),
  };
}

/** Formato HH:MM de 24 h que acepta la API (mismo que el schema de la alerta). */
const RE_HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Todo lo que sabe el formulario de nueva alerta (campos del viaje y de la vuelta). */
export type FormularioAlerta = {
  origen: string;
  destino: string;
  frecuencia: Frecuencia;
  fecha: string;
  /** Fecha que viaja al servidor: cotidiano y "cualquier fecha" se anclan a hoy. */
  fechaEfectiva: string;
  dias: number[];
  horaDesde: string;
  horaHasta: string;
  numeroTren: string;
  criterios: Criterio[];
  conexiones: boolean;
  precioObjetivo: string;
  intervalo: number;
  bono: string;
  notas: string;
  tambienVuelta: boolean;
  fechaVuelta: string;
  horaDesdeVuelta: string;
  horaHastaVuelta: string;
};

export type PreparacionEnvio =
  { ok: true; datos: CrearAlertaInput } | { ok: false; mensaje: string };

/**
 * Monta el payload de la alerta y lo valida, con los mismos avisos y en el
 * mismo orden en que los mira el formulario: días, criterios, schema, fecha de
 * la vuelta y su franja. Devuelve el payload o el mensaje para el
 * `Alert.alert` de revisión de campos (siempre con el mismo título).
 */
export function prepararEnvio(f: FormularioAlerta): PreparacionEnvio {
  if (f.frecuencia === 'dias' && f.dias.length === 0) {
    return { ok: false, mensaje: t('nueva.errorDias') };
  }
  if (f.criterios.length === 0) {
    return { ok: false, mensaje: t('nueva.errorSinCriterio') };
  }
  if (f.criterios.length > MAX_CRITERIOS) {
    return { ok: false, mensaje: t('nueva.errorMaxCriterios') };
  }
  const recurrente = f.frecuencia === 'diaria' || f.frecuencia === 'dias';
  const validacion = validarAlerta({
    origenNombre: f.origen.trim(),
    destinoNombre: f.destino.trim(),
    // Un trayecto cotidiano o "cualquier fecha" se ancla a hoy
    fechaViaje: f.fechaEfectiva,
    recurrente,
    // Único formato de días: vacío = todos los días
    diasSemana: recurrente ? [...f.dias].sort((a, b) => a - b) : [],
    // "Cualquier fecha en los próximos 6 meses": el worker rota el rango
    fechaFlexible: f.frecuencia === 'flexible',
    horaDesde: f.horaDesde.trim() || null,
    horaHasta: f.horaHasta.trim() || null,
    numeroTren: f.numeroTren.trim() || null,
    // Multi-criterio: la lista manda; `criterio` sigue viajando como el primero
    // de la lista (compatibilidad con la API vieja)
    criterio: f.criterios[0] ?? 'DISPONIBILIDAD',
    criterios: f.criterios,
    // Solo aplica con DISPONIBILIDAD vigilado: si se desmarca, el control se
    // oculta y aquí se manda false (la API también lo fuerza a false)
    conexiones: f.criterios.includes('DISPONIBILIDAD') && f.conexiones,
    // Solo aplica si se vigilan precios; en el resto lo mandamos a null
    precioObjetivo: f.criterios.includes('PRECIO') ? Number(f.precioObjetivo) : null,
    intervaloSondeoMin: f.intervalo,
    bono: f.bono,
    notas: f.notas.trim() || null,
  });
  if (!validacion.success) {
    return { ok: false, mensaje: validacion.error.issues[0]?.message ?? t('nueva.datosInvalidos') };
  }
  if (f.tambienVuelta && !f.fechaVuelta) {
    return { ok: false, mensaje: t('nueva.errorFechaVuelta') };
  }
  if (f.tambienVuelta && f.frecuencia === 'fecha' && f.fecha && f.fechaVuelta < f.fecha) {
    return { ok: false, mensaje: t('nueva.errorFechaVueltaOrden') };
  }
  const desdeVuelta = f.horaDesdeVuelta.trim();
  const hastaVuelta = f.horaHastaVuelta.trim();
  if (f.tambienVuelta && (desdeVuelta || hastaVuelta)) {
    if (
      (desdeVuelta && !RE_HORA.test(desdeVuelta)) ||
      (hastaVuelta && !RE_HORA.test(hastaVuelta))
    ) {
      return { ok: false, mensaje: t('nueva.errorFranjaVuelta') };
    }
    if (desdeVuelta && hastaVuelta && desdeVuelta > hastaVuelta) {
      return { ok: false, mensaje: t('nueva.errorFranjaVueltaOrden') };
    }
  }
  return { ok: true, datos: validacion.data };
}

export type Resumen = {
  fecha: string;
  franja: string | null;
  criterio: string;
  /** Los cuatro trozos unidos (ruta incluida): lo que se cuenta en el aviso. */
  completo: string;
  /** Salidas de los próximos trenes (HH:MM), como máximo tres. */
  salidas: string[];
};

/**
 * Resumen de la alerta con los campos ACTUALES del formulario: la tarjeta del
 * pie y el aviso final usan el mismo cálculo para poder distinguir dos alertas
 * de la misma ruta.
 */
export function resumenAlerta(datos: {
  origen: string;
  destino: string;
  frecuencia: Frecuencia;
  fecha: string;
  dias: number[];
  horaDesde: string;
  horaHasta: string;
  criterios: Criterio[];
  precioObjetivo: string;
  intervalo: number;
  trenes: HorarioTrenResponse[];
}): Resumen {
  const etiquetas = etiquetasDeCriterios();
  const flexible = datos.frecuencia === 'flexible';
  const recurrente = datos.frecuencia === 'diaria' || datos.frecuencia === 'dias';
  const criterioEtiqueta = datos.criterios.map((c) => etiquetas[c]).join(', ');
  const fecha = flexible
    ? t('nueva.resumenFlexible')
    : recurrente
      ? etiquetaDiasSemana(datos.dias)
      : datos.fecha.trim()
        ? fechaCorta(datos.fecha.trim())
        : t('nueva.sinFecha');
  const franja =
    datos.horaDesde.trim() || datos.horaHasta.trim()
      ? `${datos.horaDesde.trim() || '00:00'}–${datos.horaHasta.trim() || '23:59'}`
      : null;
  const criterio = [
    criterioEtiqueta,
    datos.criterios.includes('PRECIO') && datos.precioObjetivo.trim()
      ? `≤ ${datos.precioObjetivo.trim()} €`
      : null,
    t('nueva.cadaMin', { min: datos.intervalo }),
  ]
    .filter(Boolean)
    .join(' ');
  const ruta = `${datos.origen.trim() || '—'} → ${datos.destino.trim() || '—'}`;
  const completo = [ruta, fecha, franja, criterio].filter(Boolean).join(' · ');
  const salidas = datos.trenes.slice(0, 3).map((tren) => horaGtfs(tren.salida));
  return { fecha, franja, criterio, completo, salidas };
}
