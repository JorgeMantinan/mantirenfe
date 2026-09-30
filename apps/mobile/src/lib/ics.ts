/**
 * Genera un `.ics` (RFC 5545) con el recordatorio de salida de una alerta,
 * para el botón «Añadir al calendario».
 *
 * Un solo VEVENT por alerta:
 * - `DTSTART`: `fechaViaje` con la primera salida conocida (`ultimoEstado`);
 *   si aún no hay sondeos, `horaDesde`; y si no hay ninguna hora, 07:00
 *   genérico y el `SUMMARY` sin hora.
 * - `VALARM` con `TRIGGER:-PT50M`, que coincide con el recordatorio de la app
 *   (`minutosRecordatorio` no está en el DTO, así que usamos 50, el valor por
 *   defecto de `worker/src/processors/recordatorios.ts`).
 * - `recurrente` → `RRULE:FREQ=DAILY` con `UNTIL` a 365 días (hay clientes que
 *   no importan repeticiones sin fin) y `BYDAY=MO,TU,WE,TH,FR` si
 *   `soloLaborables`.
 *
 * Las horas son «floating» (sin zona horaria): el calendario del usuario las
 * interpreta en su huso, que para un tren peninsular es lo esperado. Es copia
 * de `apps/web/src/lib/ics.ts` sin el nombre/descarga del fichero (eso va en
 * web, con `Blob` + `a[download]`): aquí el VEVENT se comparte con `Share` y
 * el sistema decide cómo abrirlo, por eso los textos salen del i18n de la app
 * (mismas claves `ics.*` que en web).
 */

import { t } from '../i18n';

/** Subconjunto de `AlertaResponse` necesario para montar el evento. */
export interface AlertaParaIcs {
  id?: string;
  origenNombre: string;
  destinoNombre: string;
  /** Día del viaje en `YYYY-MM-DD`. */
  fechaViaje: string;
  horaDesde?: string | null;
  horaHasta?: string | null;
  numeroTren?: string | null;
  recurrente?: boolean;
  soloLaborables?: boolean;
  /** Últimos trenes sondeados: de `salida` (ISO GTFS) sale la hora del VEVENT. */
  ultimoEstado?: { salida: string }[] | null;
}

/** Hora del evento cuando la alerta no tiene ninguna salida conocida. */
const HORA_GENERICA = '07:00';

/**
 * Aviso de salida por defecto de la app: el DTO de la alerta no expone
 * `minutosRecordatorio`, así que el ICS usa 50 minutos fijos.
 */
export const MINUTOS_AVISO_ICS = 50;

/** Las repeticiones acaban a los 365 días: `RRULE` sin `UNTIL` no la aceptan todos. */
const DIAS_RECURRENCIA = 365;

const RE_HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

/** TEXT de RFC 5545: barra invertida, punto y coma, coma y saltos de línea. */
function escaparTexto(texto: string): string {
  return texto
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');
}

/** Hora peninsular (HH:MM) de un ISO GTFS, o null si no es legible. */
function horaDeIso(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const hora = iso.slice(11, 16);
  return RE_HORA.test(hora) ? hora : null;
}

function esHoraValida(hora: string | null | undefined): hora is string {
  return hora !== null && hora !== undefined && RE_HORA.test(hora);
}

/** Primera salida conocida de `ultimoEstado`, preferentemente dentro de la franja. */
function primeraSalida(alerta: AlertaParaIcs): string | null {
  const horas = (alerta.ultimoEstado ?? [])
    .map((tren) => horaDeIso(tren.salida))
    .filter((hora): hora is string => hora !== null)
    .sort();
  if (horas.length === 0) return null;
  const enFranja = horas.filter(
    (hora) =>
      (!esHoraValida(alerta.horaDesde) || hora >= alerta.horaDesde) &&
      (!esHoraValida(alerta.horaHasta) || hora <= alerta.horaHasta),
  );
  // Si ninguna salida cae en la franja (sondeo de antes de cambiarla), la primera global
  return enFranja[0] ?? horas[0] ?? null;
}

/** Hora del VEVENT; null → evento genérico a las 07:00 y sin hora en el título. */
function horaEvento(alerta: AlertaParaIcs): string | null {
  return primeraSalida(alerta) ?? (esHoraValida(alerta.horaDesde) ? alerta.horaDesde : null);
}

/** `RRULE` de las alertas recurrentes, o null si el viaje es puntual. */
function reglaRecurrencia(alerta: AlertaParaIcs): string | null {
  if (!alerta.recurrente) return null;
  const inicio = new Date(`${alerta.fechaViaje}T00:00:00Z`);
  const partes = ['FREQ=DAILY'];
  if (!Number.isNaN(inicio.getTime())) {
    inicio.setUTCDate(inicio.getUTCDate() + DIAS_RECURRENCIA);
    partes.push(`UNTIL=${inicio.toISOString().slice(0, 10).replace(/-/g, '')}T235959`);
  }
  if (alerta.soloLaborables) partes.push('BYDAY=MO,TU,WE,TH,FR');
  return partes.join(';');
}

function slug(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function slugTrayecto(alerta: AlertaParaIcs): string {
  return [slug(alerta.origenNombre), slug(alerta.destinoNombre)].filter(Boolean).join('-');
}

/** UID estable: reimportar el mismo `.ics` actualiza el evento en vez de duplicarlo. */
function uid(alerta: AlertaParaIcs): string {
  const clave = alerta.id ?? `${slugTrayecto(alerta)}-${alerta.fechaViaje}`;
  return `mantirenfe-${clave}@mantirenfe`;
}

/** `DTSTAMP` en UTC: `YYYYMMDDTHHMMSSZ`. */
function selloUtc(ahora: Date): string {
  return `${ahora.toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`;
}

export function construirIcs(alerta: AlertaParaIcs, ahora: Date = new Date()): string {
  const hora = horaEvento(alerta);
  const ruta = `${alerta.origenNombre} → ${alerta.destinoNombre}`;
  const resumen = `${t('ics.aviso', { ruta })}${hora ? ` ${hora}` : ''}${
    alerta.numeroTren ? t('ics.tren', { tren: alerta.numeroTren }) : ''
  }`;
  const detalle = [
    t('ics.alerta', { ruta }),
    t('ics.fecha', { fecha: alerta.fechaViaje }),
    alerta.horaDesde || alerta.horaHasta
      ? t('ics.franja', {
          desde: alerta.horaDesde ?? '00:00',
          hasta: alerta.horaHasta ?? '23:59',
        })
      : null,
    alerta.numeroTren ? t('ics.trenLinea', { tren: alerta.numeroTren }) : null,
  ]
    .filter((linea): linea is string => linea !== null)
    .join('\n');
  const recurrencia = reglaRecurrencia(alerta);
  const dtstart = `${alerta.fechaViaje.replace(/-/g, '')}T${(hora ?? HORA_GENERICA).replace(
    ':',
    '',
  )}00`;

  const lineas = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//MantiRenfe//Alertas de trenes//ES',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid(alerta)}`,
    `DTSTAMP:${selloUtc(ahora)}`,
    `DTSTART:${dtstart}`,
    `SUMMARY:${escaparTexto(resumen)}`,
    `DESCRIPTION:${escaparTexto(detalle)}`,
    `LOCATION:${escaparTexto(alerta.origenNombre)}`,
    ...(recurrencia ? [`RRULE:${recurrencia}`] : []),
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    `DESCRIPTION:${escaparTexto(t('ics.recordatorio', { ruta }))}`,
    `TRIGGER:-PT${MINUTOS_AVISO_ICS}M`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return `${lineas.join('\r\n')}\r\n`;
}
