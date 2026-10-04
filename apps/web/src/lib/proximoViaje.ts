import { fechaGtfs, type AlertaResponse, type EstadoSerializado } from '@mantirenfe/shared-types';
import { i18n, locale } from '@/i18n';
import { formatearPrecio } from './precios';

/** Días que miramos hacia delante cuando una alerta recurrente no tiene trenes hoy. */
export const HORIZONTE_DIAS = 7;

/** Estado de la plaza del tren elegido (para el badge de la tarjeta). */
export type EstadoPlazas = 'cancelado' | 'plazas' | 'completo' | 'sin-datos';

/** Variantes de `Badge` que usa la tarjeta, sin depender de React. */
export type VarianteBadge = 'destructive' | 'exito' | 'secondary' | 'outline';

export interface ProximaSalida {
  alertaId: string;
  origenNombre: string;
  destinoNombre: string;
  /** Día peninsular de la salida (YYYY-MM-DD). */
  fecha: string;
  /** Hora peninsular (HH:MM); null si solo conocemos el día. */
  salida: string | null;
  /** Marca de tiempo de la salida para la cuenta atrás; null sin hora. */
  salidaEn: number | null;
  numeroTren: string | null;
  estado: EstadoPlazas;
  precioMin: number | null;
  intervaloSondeoMin: number;
}

export interface RelojPeninsular {
  /** Día peninsular (YYYY-MM-DD). */
  fecha: string;
  /** Hora peninsular (HH:MM). */
  hora: string;
}

const fmtHoraPeninsular = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Europe/Madrid',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** Reloj de España (día y hora) para comparar con las salidas del worker. */
export function relojPeninsular(ahora: Date = new Date()): RelojPeninsular {
  return { fecha: fechaGtfs(ahora), hora: fmtHoraPeninsular.format(ahora) };
}

function aFecha(fecha: string): { anio: number; mes: number; dia: number } {
  const [anio, mes, dia] = fecha.split('-').map(Number);
  return { anio: anio ?? 1970, mes: mes ?? 1, dia: dia ?? 1 };
}

/** Suma días a una fecha (YYYY-MM-DD) sin depender de la zona horaria local. */
export function sumarDias(fecha: string, dias: number): string {
  const { anio, mes, dia } = aFecha(fecha);
  return new Date(Date.UTC(anio, mes - 1, dia + dias)).toISOString().slice(0, 10);
}

/** Día de la semana (0 = domingo) de una fecha YYYY-MM-DD. */
function diaSemana(fecha: string): number {
  const { anio, mes, dia } = aFecha(fecha);
  return new Date(Date.UTC(anio, mes - 1, dia)).getUTCDay();
}

/**
 * ¿Se vigila la alerta en esa fecha? Las recurrentes no caducan y respetan sus
 * `diasSemana` (vacío = todos los días); las de fecha flexible valen para
 * cualquier día (su rango lo vigila el worker); las puntuales van por su fecha.
 */
export function aplicaEnFecha(
  alerta: Pick<AlertaResponse, 'recurrente' | 'diasSemana' | 'fechaViaje' | 'fechaFlexible'>,
  fecha: string,
): boolean {
  if (alerta.fechaFlexible) return true;
  if (!alerta.recurrente) return alerta.fechaViaje === fecha;
  if (alerta.diasSemana.length === 0) return true;
  return alerta.diasSemana.includes(diaSemana(fecha));
}

/**
 * Primer día (>= desde) en el que toca vigilar la alerta. Las puntuales solo
 * valen en su fecha de viaje (null si ya pasó); las de fecha flexible valen
 * desde hoy; las recurrentes miran hasta `HORIZONTE_DIAS` días (para saltarse
 * los días no marcados en `diasSemana`).
 */
export function proximaFechaAplicable(
  alerta: Pick<AlertaResponse, 'recurrente' | 'diasSemana' | 'fechaViaje' | 'fechaFlexible'>,
  desde: string,
): string | null {
  if (alerta.fechaFlexible) return desde;
  if (!alerta.recurrente) return alerta.fechaViaje >= desde ? alerta.fechaViaje : null;
  for (let i = 0; i <= HORIZONTE_DIAS; i++) {
    const fecha = sumarDias(desde, i);
    if (aplicaEnFecha(alerta, fecha)) return fecha;
  }
  return null;
}

/**
 * `salida` de `ultimoEstado` como día + hora peninsulares. El worker guarda la
 * hora GTFS tratada como UTC (`2026-09-28T06:00:00.000Z` = 06:00 de servicio);
 * si viniera solo la hora (`06:00`) devolvemos `fecha: null`.
 */
function parseSalida(bruto: string): { fecha: string | null; hora: string } {
  if (bruto.includes('T')) return { fecha: bruto.slice(0, 10), hora: bruto.slice(11, 16) };
  const hora = bruto.slice(0, 5);
  return { fecha: null, hora: /^\d{2}:\d{2}$/.test(hora) ? hora : '' };
}

/** Trenes de la alerta para ese día dentro de su franja horaria, por hora. */
function trenesDelDia(alerta: AlertaResponse, fecha: string): EstadoSerializado[] {
  return (alerta.ultimoEstado ?? [])
    .map((tren) => ({ tren, parsed: parseSalida(tren.salida) }))
    .filter(({ parsed }) => parsed.fecha === null || parsed.fecha === fecha)
    .filter(({ parsed }) => {
      if (!parsed.hora) return false;
      if (alerta.horaDesde && parsed.hora < alerta.horaDesde) return false;
      if (alerta.horaHasta && parsed.hora > alerta.horaHasta) return false;
      return true;
    })
    .sort((a, b) => a.parsed.hora.localeCompare(b.parsed.hora))
    .map(({ tren }) => tren);
}

function estadoDeTren(tren: EstadoSerializado): EstadoPlazas {
  if (tren.cancelado === true) return 'cancelado';
  return tren.disponible ? 'plazas' : 'completo';
}

function salidaConTren(
  alerta: AlertaResponse,
  fecha: string,
  tren: EstadoSerializado,
): ProximaSalida {
  const { hora } = parseSalida(tren.salida);
  return {
    alertaId: alerta.id,
    origenNombre: alerta.origenNombre,
    destinoNombre: alerta.destinoNombre,
    fecha,
    salida: hora,
    salidaEn: instantePeninsular(fecha, hora),
    numeroTren: tren.numeroTren || alerta.numeroTren || null,
    estado: estadoDeTren(tren),
    precioMin: tren.precioMin,
    intervaloSondeoMin: alerta.intervaloSondeoMin,
  };
}

function salidaSinTren(alerta: AlertaResponse, fecha: string): ProximaSalida {
  return {
    alertaId: alerta.id,
    origenNombre: alerta.origenNombre,
    destinoNombre: alerta.destinoNombre,
    fecha,
    salida: null,
    salidaEn: null,
    numeroTren: alerta.numeroTren || null,
    estado: 'sin-datos',
    precioMin: null,
    intervaloSondeoMin: alerta.intervaloSondeoMin,
  };
}

/** Candidata de una alerta: su próxima salida (null si ya no tiene ninguna). */
function candidataDeAlerta(
  alerta: AlertaResponse,
  hoy: string,
  horaAhora: string,
): ProximaSalida | null {
  const primera = proximaFechaAplicable(alerta, hoy);
  if (!primera) return null;

  const delDia = trenesDelDia(alerta, primera);
  const sinSalir = delDia.filter((tren) => {
    const { hora } = parseSalida(tren.salida);
    return primera > hoy || hora >= horaAhora;
  });
  if (sinSalir[0]) return salidaConTren(alerta, primera, sinSalir[0]);

  if (primera === hoy && delDia.length > 0 && !alerta.recurrente) {
    // El único viaje puntual de hoy ya ha salido: no queda nada que enseñar.
    return null;
  }

  // ¿Hay trenes ya conocidos en un día aplicable posterior (estado guardado
  // de otro día)? Muestran más información que "hoy, sin datos".
  for (let i = 1; i <= HORIZONTE_DIAS; i++) {
    const dia = sumarDias(primera, i);
    if (!aplicaEnFecha(alerta, dia)) continue;
    const otros = trenesDelDia(alerta, dia);
    if (otros[0]) return salidaConTren(alerta, dia, otros[0]);
  }

  if (primera === hoy && delDia.length > 0 && alerta.recurrente) {
    // Hoy no queda nada: la próxima salida de un trayecto cotidiano es mañana.
    const manana = proximaFechaAplicable(alerta, sumarDias(hoy, 1));
    if (manana) return salidaSinTren(alerta, manana);
  }
  return salidaSinTren(alerta, primera);
}

/**
 * Próxima salida entre las alertas ACTIVAS: primero el día más temprano (hoy si
 * la alerta toca hoy) y, a igualdad de día, la hora más temprana; una salida
 * sin hora confirmada pierde frente a un tren conocido del mismo día.
 *
 * Solo sirve para mostrar la tarjeta del dashboard: no toca el worker.
 */
export function proximaSalida(
  alertas: AlertaResponse[],
  ahora: Date = new Date(),
): ProximaSalida | null {
  const { fecha: hoy, hora } = relojPeninsular(ahora);
  let mejor: ProximaSalida | null = null;

  for (const alerta of alertas) {
    if (alerta.estado !== 'ACTIVA') continue;
    const candidata = candidataDeAlerta(alerta, hoy, hora);
    if (!candidata) continue;
    if (mejor === null || claveOrden(candidata) < claveOrden(mejor)) mejor = candidata;
  }
  return mejor;
}

/** Orden: día, y dentro del día la hora (o por detrás si aún no se conoce). */
function claveOrden(salida: ProximaSalida): string {
  return `${salida.fecha}|${salida.salida ?? '~'}`;
}

function ultimoDomingo(anio: number, mes: number): number {
  const ultimoDia = new Date(Date.UTC(anio, mes, 0));
  return ultimoDia.getUTCDate() - ultimoDia.getUTCDay();
}

/**
 * Desfase peninsular (minutos) de una fecha+hora: CEST (+120) desde el último
 * domingo de marzo 01:00 UTC hasta el último domingo de octubre 01:00 UTC.
 */
function offsetPeninsular(fecha: string, hora: string): number {
  const { anio, mes, dia } = aFecha(fecha);
  const [h, m] = hora.split(':').map(Number);
  const comoUtc = Date.UTC(anio, mes - 1, dia, h ?? 0, m ?? 0);
  const inicio = Date.UTC(anio, 2, ultimoDomingo(anio, 3), 1);
  const fin = Date.UTC(anio, 9, ultimoDomingo(anio, 10), 1);
  return comoUtc >= inicio && comoUtc < fin ? 120 : 60;
}

/** Instante real (ms) de una salida peninsular, para la cuenta atrás. */
export function instantePeninsular(fecha: string, hora: string): number {
  const { anio, mes, dia } = aFecha(fecha);
  const [h, m] = hora.split(':').map(Number);
  return Date.UTC(anio, mes - 1, dia, h ?? 0, m ?? 0) - offsetPeninsular(fecha, hora) * 60_000;
}

/** "faltan 3 h 25 min" (o "ha salido") a partir de los milisegundos restantes. */
export function cuentaAtras(milisegundos: number): string {
  if (milisegundos <= 0) return i18n.t('viaje.haSalido');
  const minutos = Math.floor(milisegundos / 60_000);
  if (minutos === 0) return i18n.t('viaje.cuentaMenosDeUno');
  const dias = Math.floor(minutos / 1440);
  const horas = Math.floor((minutos % 1440) / 60);
  const resto = minutos % 60;
  if (dias > 0) return i18n.t('viaje.cuentaDias', { dias, horas });
  if (horas > 0) {
    return resto === 0
      ? i18n.t('viaje.cuentaHoras', { horas })
      : i18n.t('viaje.cuentaHorasMin', { horas, min: resto });
  }
  return i18n.t('viaje.cuentaMinutos', { min: minutos });
}

/** Día de la semana en el idioma activo ("miércoles" / "Wednesday"). */
const fmtDiaSemana = () => new Intl.DateTimeFormat(locale(), { weekday: 'long', timeZone: 'UTC' });

/** Fecha corta ("3 oct" / "3 Oct") para la tarjeta. */
export function fechaCorta(fecha: string): string {
  return new Intl.DateTimeFormat(locale(), {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(new Date(`${fecha}T00:00:00Z`));
}

/**
 * Etiqueta del día de una salida: "Hoy", "Mañana", "lunes 29" (si está cerca)
 * o "3 oct" si ya queda más de una semana.
 */
export function etiquetaDia(fecha: string, hoy: string): string {
  if (fecha <= hoy) return i18n.t('viaje.hoy');
  const manana = sumarDias(hoy, 1);
  if (fecha === manana) return i18n.t('viaje.manana');
  const { dia } = aFecha(fecha);
  const dias = Math.round(
    (Date.parse(`${fecha}T00:00:00Z`) - Date.parse(`${hoy}T00:00:00Z`)) / 86_400_000,
  );
  if (dias <= 7) {
    const nombreDia = fmtDiaSemana().format(new Date(`${fecha}T00:00:00Z`));
    return `${nombreDia} ${dia}`.trim();
  }
  return fechaCorta(fecha);
}

/** Texto del badge de estado de la próxima salida. */
export function textoPlazas(salida: Pick<ProximaSalida, 'estado' | 'precioMin'>): string {
  switch (salida.estado) {
    case 'cancelado':
      return i18n.t('estados.cancelado');
    case 'plazas':
      return salida.precioMin === null
        ? i18n.t('estados.hayPlazas')
        : i18n.t('estados.hayPlazasDesde', { precio: formatearPrecio(salida.precioMin) });
    case 'completo':
      return i18n.t('estados.completo');
    default:
      return i18n.t('estados.sinDatosPlazas');
  }
}

/** Variante del badge de estado (colores: rojo / verde / gris / contorno). */
export function variantePlazas(estado: EstadoPlazas): VarianteBadge {
  if (estado === 'cancelado') return 'destructive';
  if (estado === 'plazas') return 'exito';
  if (estado === 'completo') return 'secondary';
  return 'outline';
}
