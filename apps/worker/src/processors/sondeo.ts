import type { Logger } from 'pino';
import { getPrisma } from '@mantirenfe/database';
import {
  funcionIndemnizacion,
  horaGtfs,
  HORIZONTE_FLEXIBLE_DIAS,
  type ConsultaDisponibilidad,
  type EstadoDisponibilidad,
  type EstadoSerializado,
} from '@mantirenfe/shared-types';
import { crearFuenteDatos } from '../fuentes';
import { deduplicarTrenes } from '../fuentes/renfe-dwr';
import { enviarEmail } from '../notificaciones/email';
import { enviarPushMovil } from '../notificaciones/expo-push';
import { preferenciaBooleana } from '../notificaciones/preferencias';
import { pushHabilitado } from '../notificaciones/util';
import { enviarPush } from '../notificaciones/web-push';
import { hoyGtfs } from './reloj';

// El tipo vive en shared-types (lo consumen la API, la web y el móvil);
// se re-exporta aquí para no romper a nadie que lo importara de este fichero.
export type { EstadoSerializado };

// Mismo criterio que el resumen semanal: una sola implementación en
// notificaciones/util.ts, re-exportada para los tests de este fichero.
export { pushHabilitado };

export function serializarEstado(estado: EstadoDisponibilidad): EstadoSerializado[] {
  // `deduplicarTrenes` es una red de seguridad para TODAS las fuentes: dos filas
  // con el mismo trenId y la misma salida son la misma fila vista dos veces (la
  // UI usaría la misma clave de React y los diffs por trenId se perderían una).
  return deduplicarTrenes(estado.trenes)
    .sort((a, b) => a.trenId.localeCompare(b.trenId))
    .map((t) => {
      const serializado: EstadoSerializado = {
        trenId: t.trenId,
        numeroTren: t.numeroTren,
        salida: t.salida,
        disponible: t.disponible,
        precioMin: t.precioMin,
        retrasoSeg: t.retrasoSeg ?? null,
        cancelado: t.cancelado === true,
      };
      if (t.paradasSuprimidas && t.paradasSuprimidas.length > 0) {
        serializado.paradasSuprimidas = [...t.paradasSuprimidas];
      }
      // Campos "opcionales de detalle": solo se guardan si existen, para no
      // inflar `alerta.ultimoEstado` en alertas de fuentes que no los traen.
      if (t.tramo) serializado.tramo = t.tramo;
      if (t.conexionEn) serializado.conexionEn = t.conexionEn;
      if (t.conexionLlegada) serializado.conexionLlegada = t.conexionLlegada;
      if (t.conexionSalida) serializado.conexionSalida = t.conexionSalida;
      if (typeof t.esperaMin === 'number') serializado.esperaMin = t.esperaMin;
      if (t.horaLlegada) serializado.horaLlegada = t.horaLlegada;
      if (typeof t.duracionMin === 'number') serializado.duracionMin = t.duracionMin;
      if (t.tipoTren) serializado.tipoTren = t.tipoTren;
      if (t.tarifa) serializado.tarifa = t.tarifa;
      return serializado;
    });
}

export function diffDisponibles(anterior: EstadoSerializado[], actual: EstadoSerializado[]) {
  const antes = new Map(anterior.map((t) => [t.trenId, t.disponible]));
  const aparecen: EstadoSerializado[] = [];
  const desaparecen: EstadoSerializado[] = [];

  for (const tren of actual) {
    const previo = antes.get(tren.trenId);
    if (previo === false && tren.disponible) aparecen.push(tren);
    if (previo === true && !tren.disponible) desaparecen.push(tren);
    antes.delete(tren.trenId);
  }
  return { aparecen, desaparecen };
}

export function diffHorarios(anterior: EstadoSerializado[], actual: EstadoSerializado[]) {
  const previas = new Map(anterior.map((t) => [t.trenId, t.salida]));
  const actuales = new Map(actual.map((t) => [t.trenId, t.salida]));
  const nuevos = actual.filter((t) => !previas.has(t.trenId));
  const salidos = anterior.filter((t) => !actuales.has(t.trenId));
  const cambiados = actual.filter((t) => {
    const previa = previas.get(t.trenId);
    return previa !== undefined && previa !== t.salida;
  });
  return { nuevos, salidos, cambiados };
}

export function filtrarRetrasados(
  actual: EstadoSerializado[],
  umbralSeg: number,
): EstadoSerializado[] {
  return actual.filter((t) => typeof t.retrasoSeg === 'number' && t.retrasoSeg >= umbralSeg);
}

export function filtrarCancelados(actual: EstadoSerializado[]): EstadoSerializado[] {
  return actual.filter((t) => t.cancelado === true);
}

/** El tren cumple el umbral: su precio mínimo es conocido y ≤ objetivo. */
function cumplePrecioObjetivo(tren: EstadoSerializado, precioObjetivo: number): boolean {
  return typeof tren.precioMin === 'number' && tren.precioMin <= precioObjetivo;
}

/** Trenes por debajo (o en) el precio objetivo de una alerta con criterio PRECIO. */
export function filtrarBajoObjetivo(
  actual: EstadoSerializado[],
  precioObjetivo: number | null | undefined,
): EstadoSerializado[] {
  if (typeof precioObjetivo !== 'number' || !Number.isFinite(precioObjetivo)) return [];
  return actual.filter((t) => cumplePrecioObjetivo(t, precioObjetivo));
}

/**
 * Trenes que acaban de entrar en el umbral: estaban por encima (o sin precio)
 * en el `ultimoEstado` guardado y ahora cumplen. Un tren que sigue barato no
 * vuelve a avisar en cada sondeo (mismo patrón que `nuevosCancelados`).
 */
export function nuevosBajoObjetivo(
  anterior: EstadoSerializado[],
  actual: EstadoSerializado[],
  precioObjetivo: number | null | undefined,
): EstadoSerializado[] {
  const previos = new Set(filtrarBajoObjetivo(anterior, precioObjetivo).map((t) => t.trenId));
  return filtrarBajoObjetivo(actual, precioObjetivo).filter((t) => !previos.has(t.trenId));
}

export function nuevosCancelados(
  anterior: EstadoSerializado[],
  actual: EstadoSerializado[],
): EstadoSerializado[] {
  const previos = new Set(anterior.filter((t) => t.cancelado === true).map((t) => t.trenId));
  return filtrarCancelados(actual).filter((t) => !previos.has(t.trenId));
}

export interface ParadaSuprimidaDetectada {
  tren: EstadoSerializado;
  /** Estaciones suprimidas que no estaban en el sondeo anterior (nuevas) */
  estaciones: string[];
}

/**
 * Paradas suprimidas (GTFS-RT SKIPPED) aparecidas desde el último sondeo: se
 * compara par tren+estación, así una supresión que sigue igual no vuelve a avisar
 * aunque se repita en cada ciclo.
 */
export function nuevasParadasSuprimidas(
  anterior: EstadoSerializado[],
  actual: EstadoSerializado[],
): ParadaSuprimidaDetectada[] {
  const previasPorTren = new Map(
    anterior.map((t) => [t.trenId, new Set(t.paradasSuprimidas ?? [])]),
  );
  const detectadas: ParadaSuprimidaDetectada[] = [];
  for (const tren of actual) {
    const previas = previasPorTren.get(tren.trenId);
    const nuevas = (tren.paradasSuprimidas ?? []).filter((nombre) => !previas?.has(nombre));
    if (nuevas.length > 0) detectadas.push({ tren, estaciones: nuevas });
  }
  return detectadas;
}

/** El histórico de precios de una alerta se conserva 45 días. */
export const RETENCION_PRECIOS_MS = 45 * 24 * 60 * 60 * 1000;

/**
 * Trenes cuyo `precioMin` o `disponible` cambió respecto al estado anterior:
 * son los puntos que merece la pena registrar en el histórico de precios.
 * En el primer sondeo no hay referencia previa, así que se registran todos.
 */
export function filtrarCambiosPrecio(
  anterior: EstadoSerializado[],
  actual: EstadoSerializado[],
  primeraVez: boolean,
): EstadoSerializado[] {
  if (primeraVez) return actual;
  const previos = new Map(anterior.map((t) => [t.trenId, t]));
  return actual.filter((t) => {
    const previo = previos.get(t.trenId);
    // Un tren que aún no existía también es un cambio (entrada en venta)
    if (!previo) return true;
    return previo.precioMin !== t.precioMin || previo.disponible !== t.disponible;
  });
}

/**
 * Guarda un punto de `PrecioTren` por cada tren con cambios y poda lo anterior
 * a 45 días. Cualquier error se relega a un warn: el historial nunca rompe el
 * sondeo ni la notificación. Devuelve los puntos insertados.
 */
export async function registrarHistorialPrecios(
  alertaId: string,
  anterior: EstadoSerializado[],
  actual: EstadoSerializado[],
  primeraVez: boolean,
  logger: Logger,
): Promise<number> {
  const cambios = filtrarCambiosPrecio(anterior, actual, primeraVez);
  if (cambios.length === 0) return 0;
  try {
    const prisma = getPrisma();
    await prisma.precioTren.createMany({
      data: cambios.map((t) => ({
        alertaId,
        numeroTren: t.numeroTren,
        salida: t.salida,
        precioMin: t.precioMin,
        disponible: t.disponible,
      })),
    });
    await prisma.precioTren.deleteMany({
      where: { alertaId, registradoEn: { lt: new Date(Date.now() - RETENCION_PRECIOS_MS) } },
    });
    return cambios.length;
  } catch (error) {
    logger.warn({ alertaId, err: error }, 'No se pudo registrar el histórico de precios');
    return 0;
  }
}

function criterioCoincide(alerta: { criterio: string }, codigo: string): boolean {
  if (alerta.criterio === codigo) return true;
  if (codigo === 'DISPONIBILIDAD') return alerta.criterio === 'APERTURA_VENTA';
  return false;
}

/**
 * Compara la salida de un tren (ISO o HH:MM) con la franja horaria de la
 * alerta. Sin franja, todo cuenta.
 */
export function enFranjaHoraria(
  salida: string,
  horaDesde: string | null,
  horaHasta: string | null,
): boolean {
  if (!horaDesde && !horaHasta) return true;
  const hhmm = salida.length > 5 ? salida.slice(11, 16) : salida;
  if (horaDesde && hhmm < horaDesde) return false;
  if (horaHasta && hhmm > horaHasta) return false;
  return true;
}

/**
 * Aviso del Compromiso de Puntualidad de Renfe al final del cuerpo de un aviso
 * de retraso: vacío si el retraso máximo del grupo no alcanza el umbral.
 */
export function textoIndemnizacion(maxRetrasoSeg: number): string {
  if (!funcionIndemnizacion(maxRetrasoSeg)) return '';
  return ' ⚠️ Retraso ≥ 60 min: puede dar derecho a indemnización (50-100% según servicio)';
}

export function textoCancelacion(tren: EstadoSerializado): string {
  const numero = tren.numeroTren || tren.trenId;
  return `Tu tren de las ${horaGtfs(tren.salida)} (${numero}) está cancelado hoy`;
}

export function textoParadaSuprimida(tren: EstadoSerializado, estacion: string): string {
  const numero = tren.numeroTren || tren.trenId;
  return `Tu tren de las ${horaGtfs(tren.salida)} (${numero}) no para hoy en ${estacion}`;
}

/** Cifra en € sin símbolo y con dos decimales: 42.5 → "42,50", 30 → "30,00". */
function euros(valor: number): string {
  return valor.toLocaleString('es-ES', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function textoPrecioBajo(tren: EstadoSerializado, precioObjetivo: number): string {
  const numero = tren.numeroTren || tren.trenId;
  const precio = typeof tren.precioMin === 'number' ? euros(tren.precioMin) : '—';
  return `Tren ${numero} ${horaGtfs(tren.salida)} a ${precio} € (tu objetivo: ≤${euros(precioObjetivo)} €)`;
}

// ──────────────────────────── «cualquier fecha» (rango flexible) ────────────────────────────

/**
 * Cuántas fechas consulta el worker por alerta y por sondeo con
 * `fechaFlexible` (N = 4, el máximo documentado). El rango
 * (`fechaDesde`…`fechaHasta`, hoy … hoy + 180 días) se parte en N tramos y
 * cada sondeo mira una fecha por tramo; el índice de rotación guarda en
 * `Alerta.estadoFlexible` por qué tramo va, de modo que en ~45 sondeos (7,5 h
 * a 10 min) ha recorrido todo el rango.
 *
 * Cada consulta pasa por la caché DWR compartida por ruta+fecha
 * (`renfe-dwr.ts`), así que re-sondear una fecha recién vista no vuelve a
 * tocar venta.renfe.com.
 */
export const SONDEOS_FLEXIBLE_POR_ALERTA = 4;

/** Estado rotatorio del sondeo flexible, guardado en `Alerta.estadoFlexible`. */
export interface EstadoFlexible {
  /** Próximo índice de rotación (avanza 1 en cada sondeo). */
  indice: number;
  /** Última disponibilidad vista por fecha (true = había al menos una plaza). */
  fechas: Record<string, boolean>;
}

/** Lee `Alerta.estadoFlexible`, tolerando JSON ausente o de otra versión. */
export function parsearEstadoFlexible(bruto: unknown): EstadoFlexible {
  if (!bruto || typeof bruto !== 'object' || Array.isArray(bruto)) return { indice: 0, fechas: {} };
  const objeto = bruto as { indice?: unknown; fechas?: unknown };
  const indice =
    typeof objeto.indice === 'number' && Number.isInteger(objeto.indice) && objeto.indice >= 0
      ? objeto.indice
      : 0;
  const fechas: Record<string, boolean> = {};
  if (objeto.fechas && typeof objeto.fechas === 'object' && !Array.isArray(objeto.fechas)) {
    for (const [fecha, valor] of Object.entries(objeto.fechas as Record<string, unknown>)) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(fecha) && typeof valor === 'boolean') fechas[fecha] = valor;
    }
  }
  return { indice, fechas };
}

/** Suma días a una fecha `YYYY-MM-DD` (cálculo en UTC, sin husos de por medio). */
function sumarDiasIso(fecha: string, dias: number): string {
  const [anio, mes, dia] = fecha.split('-').map(Number);
  return new Date(Date.UTC(anio ?? 1970, (mes ?? 1) - 1, (dia ?? 1) + dias))
    .toISOString()
    .slice(0, 10);
}

/** Días de diferencia entre dos fechas `YYYY-MM-DD` (negativo si `hasta` es anterior). */
function diasEntreIso(desde: string, hasta: string): number {
  return Math.round(
    (Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / 86_400_000,
  );
}

/**
 * Fechas a consultar en el sondeo `indice` de una alerta con `fechaFlexible`.
 *
 * Rotación estratificada: el rango se divide en `min(N, días+1)` tramos
 * contiguos y de cada tramo se coge la fecha que toca según el índice. Así:
 * - cada sondeo consulta **como mucho N fechas** (nunca más consultas DWR);
 * - hay una fecha por zona del rango (cerca, media y lejana) en cada pasada;
 * - rotando el índice, todo el rango se recorre en `longitud del tramo`
 *   sondeos (45 con 180 días y N = 4) y vuelve a empezar.
 */
export function fechasSondeoFlexible(desde: string, hasta: string, indice: number): string[] {
  const total = Math.max(1, diasEntreIso(desde, hasta) + 1);
  const tramos = Math.min(SONDEOS_FLEXIBLE_POR_ALERTA, total);
  const fechas: string[] = [];
  for (let i = 0; i < tramos; i++) {
    const inicio = Math.floor((i * total) / tramos);
    const fin = Math.floor(((i + 1) * total) / tramos);
    const tam = Math.max(1, fin - inicio);
    const posicion = inicio + (Math.abs(Math.trunc(indice)) % tam);
    fechas.push(sumarDiasIso(desde, posicion));
  }
  return [...new Set(fechas)];
}

/** "15 de marzo" de una fecha `YYYY-MM-DD` (los avisos del worker son en español). */
function fechaLarga(fecha: string): string {
  return new Intl.DateTimeFormat('es-ES', {
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(new Date(`${fecha}T00:00:00Z`));
}

/** "07:35 desde 32,00 €" de un tren disponible (sin precio: solo la hora). */
function detalleTrenFlexible(tren: EstadoSerializado): string {
  const hora = horaGtfs(tren.salida);
  return typeof tren.precioMin === 'number' ? `${hora} desde ${euros(tren.precioMin)} €` : hora;
}

/**
 * Cuerpo del aviso de apertura: una línea por fecha que acaba de abrir,
 * con sus primeras salidas, y el trayecto al final (mismo patrón que el aviso
 * de disponibilidad).
 */
export function cuerpoAvisoFlexible(
  ruta: string,
  abiertas: ReadonlyArray<{ fecha: string; trenes: readonly EstadoSerializado[] }>,
): string {
  const lineas = abiertas.map(
    (a) =>
      `Hay plazas el ${fechaLarga(a.fecha)}: ${a.trenes.slice(0, 3).map(detalleTrenFlexible).join(' · ')}`,
  );
  return [...lineas, ruta].join(' · ');
}

/** Alerta mínima para persistir un aviso y enviarlo por sus canales. */
export interface AvisoAlerta {
  id: string;
  usuarioId: string;
  origenNombre: string;
  destinoNombre: string;
  fechaViaje: Date;
  criterio: string;
  usuario: {
    // El sondeo lo trae en el include; solo se usa si la ruta permite email
    email?: string | null;
    preferencias: unknown;
    suscripciones: Array<{ endpoint: string; p256dh: string; auth: string }>;
    tokensMovil: Array<{ id: string; token: string }>;
  };
}

/** Fila de `Notificacion` a guardar en BD: solo persistencia, sin envíos. */
function datosNotificacion(
  alerta: AvisoAlerta,
  titulo: string,
  cuerpo: string,
  datosExtra: Record<string, unknown>,
) {
  return {
    usuarioId: alerta.usuarioId,
    alertaId: alerta.id,
    titulo,
    cuerpo,
    datos: {
      alertaId: alerta.id,
      origen: alerta.origenNombre,
      destino: alerta.destinoNombre,
      ...datosExtra,
      url: `/alertas/${alerta.id}`,
    },
  };
}

/**
 * Envío de un aviso ya persistido (push web, push móvil y email). Se ejecuta
 * SIEMPRE después del commit y es best-effort: un fallo de red no puede
 * descartar lo que ya está en BD ni romper el sondeo.
 */
async function enviarPorCanales(
  alerta: AvisoAlerta,
  titulo: string,
  cuerpo: string,
  logger: Logger,
  opciones?: { email?: boolean },
): Promise<void> {
  try {
    if (pushHabilitado(alerta.usuario.preferencias)) {
      const payload = {
        title: titulo,
        body: cuerpo,
        url: `/alertas/${alerta.id}`,
        tag: `alerta-${alerta.id}`,
      };
      await enviarPush(alerta.usuario.suscripciones, payload, logger);
      await enviarPushMovil(alerta.usuario.tokensMovil, payload, logger);
    }

    // Email: mismo aviso que el push, solo si la ruta lo permite (sondeo) y el
    // usuario activó notificacionesEmail. Es best-effort y no bloquea: los fallos
    // (o la ausencia de SMTP) se quedan en un log y el resto sigue igual.
    if (
      opciones?.email &&
      alerta.usuario.email &&
      preferenciaBooleana(alerta.usuario.preferencias, 'notificacionesEmail', false)
    ) {
      void enviarEmail(alerta.usuario.email, titulo, cuerpo, logger).catch((err: unknown) => {
        logger.warn({ alertaId: alerta.id, err }, 'No se pudo enviar el email de la alerta');
      });
    }
  } catch (error) {
    logger.warn({ alertaId: alerta.id, err: error }, 'Aviso guardado en BD pero no enviado');
  }
}

export async function notificar(
  alerta: AvisoAlerta,
  titulo: string,
  cuerpo: string,
  datosExtra: Record<string, unknown>,
  logger: Logger,
  opciones?: { email?: boolean },
): Promise<void> {
  const prisma = getPrisma();
  await prisma.notificacion.create({ data: datosNotificacion(alerta, titulo, cuerpo, datosExtra) });
  await enviarPorCanales(alerta, titulo, cuerpo, logger, opciones);
}

/** Aviso calculado en memoria, pendiente de persistir con el estado. */
interface AvisoSondeo {
  titulo: string;
  cuerpo: string;
  datos: Record<string, unknown>;
  /** Solo las rutas de sondeo mandan el email (igual que antes). */
  email: boolean;
  /** `logger.info` de confirmación una vez enviado. */
  confirmacion: { mensaje: string; campos: Record<string, unknown> };
}

/**
 * Avisos que toca enviar al comparar el estado anterior con el actual (vacío si
 * no hay cambios). Solo se calculan aquí: el estado de la alerta y las
 * `Notificacion` se guardan después juntos, en una única transacción, y los
 * envíos van tras el commit.
 */
function calcularAvisos(
  alerta: AvisoAlerta & { precioObjetivo: number | null },
  anterior: EstadoSerializado[],
  actual: EstadoSerializado[],
  fechaTexto: string,
  logger: Logger,
): AvisoSondeo[] {
  const avisos: AvisoSondeo[] = [];
  const alertaId = alerta.id;

  if (criterioCoincide(alerta, 'DISPONIBILIDAD')) {
    const { aparecen } = diffDisponibles(anterior, actual);
    if (aparecen.length === 0) {
      logger.debug({ alertaId }, 'Sin cambios de disponibilidad');
      return avisos;
    }
    const titulos = aparecen
      .map((t) => `${t.salida}${t.numeroTren ? ` (${t.numeroTren})` : ''}`)
      .join(', ');
    avisos.push({
      titulo: '¡Plaza disponible!',
      cuerpo: `Queda disponibilidad en ${alerta.origenNombre} → ${alerta.destinoNombre} el ${fechaTexto}: ${titulos}.`,
      datos: { trenes: aparecen.map((t) => t.trenId) },
      email: true,
      confirmacion: {
        mensaje: 'Notificación de disponibilidad enviada',
        campos: { trenes: aparecen.length },
      },
    });
    return avisos;
  }

  if (criterioCoincide(alerta, 'PRECIO')) {
    const precioObjetivo = alerta.precioObjetivo;
    if (typeof precioObjetivo !== 'number') {
      logger.warn({ alertaId }, 'Alerta de precio sin precioObjetivo, se omite');
      return avisos;
    }
    const bajos = nuevosBajoObjetivo(anterior, actual, precioObjetivo);
    if (bajos.length === 0) {
      logger.debug({ alertaId }, 'Sin trenes bajo el precio objetivo');
      return avisos;
    }
    const cuerpo = [
      ...bajos.map((t) => textoPrecioBajo(t, precioObjetivo)),
      `${alerta.origenNombre} → ${alerta.destinoNombre}`,
    ].join(' · ');
    avisos.push({
      titulo: 'Precio bajo tu objetivo',
      cuerpo,
      datos: { tipo: 'precio', precioObjetivo, trenes: bajos.map((t) => t.trenId) },
      email: true,
      confirmacion: {
        mensaje: 'Notificación de precio enviada',
        campos: { trenes: bajos.length, precioObjetivo },
      },
    });
    return avisos;
  }

  if (alerta.criterio === 'HORARIO') {
    const { nuevos, salidos, cambiados } = diffHorarios(anterior, actual);
    if (nuevos.length === 0 && salidos.length === 0 && cambiados.length === 0) {
      logger.debug({ alertaId }, 'Sin cambios de horario');
      return avisos;
    }
    const detalle = [
      nuevos.length > 0 ? `${nuevos.length} nueva(s) salida(s)` : null,
      cambiados.length > 0 ? `${cambiados.length} hora(s) modificada(s)` : null,
      salidos.length > 0 ? `${salidos.length} servicio(s) retirado(s)` : null,
    ]
      .filter(Boolean)
      .join(', ');
    avisos.push({
      titulo: 'Cambio de horario',
      cuerpo: `Horario actualizado en ${alerta.origenNombre} → ${alerta.destinoNombre} el ${fechaTexto}: ${detalle}.`,
      datos: {
        nuevos: nuevos.map((t) => t.trenId),
        cambiados: cambiados.map((t) => t.trenId),
        salidos: salidos.map((t) => t.trenId),
      },
      email: true,
      confirmacion: { mensaje: 'Notificación de horario enviada', campos: { detalle } },
    });
    return avisos;
  }

  if (alerta.criterio === 'RETRASO') {
    const cancelaciones = nuevosCancelados(anterior, actual);
    if (cancelaciones.length > 0) {
      avisos.push({
        titulo: 'Tren cancelado',
        cuerpo: cancelaciones.map(textoCancelacion).join(' · '),
        datos: {
          tipo: 'cancelacion',
          numeroTren: cancelaciones.map((t) => t.numeroTren || t.trenId).join(', '),
          trenes: cancelaciones.map((t) => t.trenId),
        },
        email: true,
        confirmacion: {
          mensaje: 'Notificación de cancelación enviada',
          campos: { trenes: cancelaciones.length },
        },
      });
    }

    // Un tren cancelado ya avisa por su cuenta: no se duplica con "no para en"
    const suprimidas = nuevasParadasSuprimidas(anterior, actual).filter(
      (s) => s.tren.cancelado !== true,
    );
    if (suprimidas.length > 0) {
      avisos.push({
        titulo: 'Tu tren no para hoy',
        cuerpo: suprimidas
          .flatMap((s) => s.estaciones.map((estacion) => textoParadaSuprimida(s.tren, estacion)))
          .join(' · '),
        datos: {
          tipo: 'parada_suprimida',
          trenes: suprimidas.map((s) => s.tren.trenId),
          estaciones: [...new Set(suprimidas.flatMap((s) => s.estaciones))],
        },
        email: true,
        confirmacion: {
          mensaje: 'Notificación de parada suprimida enviada',
          campos: { trenes: suprimidas.length },
        },
      });
    }

    const umbral = Number(process.env.RETRASO_UMBRAL_SEG ?? 300);
    const retrasados = filtrarRetrasados(actual, umbral);
    const previos = new Set(
      anterior
        .filter((t) => typeof t.retrasoSeg === 'number' && t.retrasoSeg >= umbral)
        .map((t) => t.trenId),
    );
    const nuevosRetrasos = retrasados.filter((t) => !previos.has(t.trenId));
    if (nuevosRetrasos.length === 0) {
      logger.debug({ alertaId }, 'Sin retrasos nuevos sobre umbral');
      return avisos;
    }
    const detalle = nuevosRetrasos
      .map((t) => {
        const min = Math.round((t.retrasoSeg ?? 0) / 60);
        return `${t.numeroTren || t.trenId} (+${min} min)`;
      })
      .join(', ');
    const maxRetrasoDelGrupo = Math.max(...nuevosRetrasos.map((t) => t.retrasoSeg ?? 0));
    avisos.push({
      titulo: 'Retraso en tu tren',
      cuerpo: `${alerta.origenNombre} → ${alerta.destinoNombre} el ${fechaTexto}: ${detalle}.${textoIndemnizacion(maxRetrasoDelGrupo)}`,
      datos: { trenes: nuevosRetrasos.map((t) => t.trenId) },
      email: true,
      confirmacion: {
        mensaje: 'Notificación de retraso enviada',
        campos: { trenes: nuevosRetrasos.length },
      },
    });
    return avisos;
  }

  logger.debug({ alertaId, criterio: alerta.criterio }, 'Criterio sin notificación');
  return avisos;
}

/** Campos de una alerta flexible: lo que lee `sondearFlexible`. */
type AlertaFlexible = Parameters<typeof notificar>[0] & {
  horaDesde: string | null;
  horaHasta: string | null;
  numeroTren: string | null;
  fechaDesde: Date | null;
  fechaHasta: Date | null;
  estadoFlexible: unknown;
};

/**
 * Sondeo de una alerta con `fechaFlexible` ("cualquier fecha en los próximos
 * 6 meses"): en lugar de una fecha concreta consulta hasta
 * `SONDEOS_FLEXIBLE_POR_ALERTA` fechas del rango en rotación y avisa en la
 * que acaba de abrir.
 *
 * - **Baseline por fecha**: el primer contacto con una fecha solo la registra
 *   (igual que el `primeraVez` del sondeo normal), así un billete que ya
 *   estaba a la venta no dispara un aviso falso.
 * - Solo cuenta la transición *no había plazas → hay plazas* de cada fecha; si
 *   vuelven a desaparecer, el siguiente aviso vuelve a estar permitido.
 * - Una fecha que falla se salta sin abortar el sondeo de las demás.
 * - `ultimoEstado` se queda con la última serie consultada (la que tiene
 *   plazas si alguna la tiene), que es lo que enseña el detalle.
 * - No escribe histórico de precios: `PrecioTren` no guarda fecha y mezclaría
 *   trenes de días distintos en la misma serie.
 */
async function sondearFlexible(alerta: AlertaFlexible, logger: Logger): Promise<void> {
  const prisma = getPrisma();
  const estado = parsearEstadoFlexible(alerta.estadoFlexible);
  const hoy = hoyGtfs();
  const desde = alerta.fechaDesde ? alerta.fechaDesde.toISOString().slice(0, 10) : hoy;
  const hasta = alerta.fechaHasta
    ? alerta.fechaHasta.toISOString().slice(0, 10)
    : sumarDiasIso(desde, HORIZONTE_FLEXIBLE_DIAS);
  const fechas = fechasSondeoFlexible(desde, hasta, estado.indice);
  const fuente = crearFuenteDatos(alerta.criterio);

  const abiertas: Array<{ fecha: string; trenes: EstadoSerializado[] }> = [];
  let ultimaSerie: EstadoSerializado[] | null = null;
  let ultimaConPlazas: EstadoSerializado[] | null = null;

  for (const fecha of fechas) {
    let serie: EstadoSerializado[];
    try {
      const consultada = await fuente.getDisponibilidad({
        origenNombre: alerta.origenNombre,
        destinoNombre: alerta.destinoNombre,
        fecha,
        horaDesde: alerta.horaDesde,
        horaHasta: alerta.horaHasta,
        numeroTren: alerta.numeroTren,
      });
      serie = serializarEstado(consultada);
    } catch (error) {
      logger.warn({ alertaId: alerta.id, fecha, err: error }, 'Fecha del rango sin sondear');
      continue;
    }
    if (alerta.horaDesde || alerta.horaHasta) {
      serie = serie.filter((t) =>
        enFranjaHoraria(t.salida, alerta.horaDesde ?? null, alerta.horaHasta ?? null),
      );
    }
    const conPlazas = serie.filter((t) => t.disponible && t.cancelado !== true);
    // `previo === undefined` es la primera vez que se mira esta fecha: baseline
    if (estado.fechas[fecha] === false && conPlazas.length > 0) {
      abiertas.push({ fecha, trenes: conPlazas });
    }
    estado.fechas[fecha] = conPlazas.length > 0;
    ultimaSerie = serie;
    if (conPlazas.length > 0) ultimaConPlazas = serie;
  }

  estado.indice += 1;
  const referencia = ultimaConPlazas ?? ultimaSerie;
  const cuerpo =
    abiertas.length > 0
      ? cuerpoAvisoFlexible(`${alerta.origenNombre} → ${alerta.destinoNombre}`, abiertas)
      : null;
  const datosAviso = cuerpo
    ? {
        tipo: 'apertura',
        fechas: abiertas.map((a) => a.fecha),
        trenes: abiertas.flatMap((a) => a.trenes.slice(0, 3).map((t) => t.trenId)),
      }
    : null;

  // Estado y aviso se guardan juntos: o se persisten los dos o no se persiste nada
  await prisma.$transaction([
    prisma.alerta.update({
      where: { id: alerta.id },
      data: {
        estadoFlexible: estado as object,
        ...(referencia ? { ultimoEstado: referencia as object } : {}),
        ultimoSondeoEn: new Date(),
      },
    }),
    ...(cuerpo && datosAviso
      ? [
          prisma.notificacion.create({
            data: datosNotificacion(alerta, '¡Billetes a la venta!', cuerpo, datosAviso),
          }),
        ]
      : []),
  ]);

  if (!cuerpo) {
    logger.debug({ alertaId: alerta.id, fechas }, 'Sin fechas recién abiertas en el rango');
    return;
  }

  await enviarPorCanales(alerta, '¡Billetes a la venta!', cuerpo, logger, { email: true });
  logger.info(
    { alertaId: alerta.id, fechas: abiertas.map((a) => a.fecha) },
    'Aviso de billetes a la venta enviado',
  );
}

export async function sondearAlerta(alertaId: string, logger: Logger): Promise<void> {
  const prisma = getPrisma();

  // Claim atómico ANTES de leer el estado: dos jobs que lleguen a la vez (el
  // barrido y el job directo de la cola) no pueden sondear la misma alerta a la
  // vez ni saltarse el intervalo mínimo entre sondeos.
  const previa = await prisma.alerta.findUnique({
    where: { id: alertaId },
    select: { estado: true, intervaloSondeoMin: true },
  });
  if (!previa) {
    logger.warn({ alertaId }, 'Alerta no existe');
    return;
  }
  if (previa.estado !== 'ACTIVA') {
    logger.debug({ alertaId, estado: previa.estado }, 'Alerta no activa, se omite');
    return;
  }
  const intervaloMin = previa.intervaloSondeoMin ?? 10;
  const reclamada = await prisma.alerta.updateMany({
    where: {
      id: alertaId,
      estado: 'ACTIVA',
      OR: [
        { ultimoSondeoEn: null },
        { ultimoSondeoEn: { lt: new Date(Date.now() - intervaloMin * 60_000) } },
      ],
    },
    data: { ultimoSondeoEn: new Date() },
  });
  if (reclamada.count === 0) {
    logger.debug({ alertaId }, 'Sondeo omitido: otro job lo reclamó o no toca aún');
    return;
  }

  const alerta = await prisma.alerta.findUnique({
    where: { id: alertaId },
    include: {
      usuario: {
        include: {
          suscripciones: { where: { activa: true } },
          tokensMovil: { where: { activa: true }, select: { id: true, token: true } },
        },
      },
    },
  });

  if (!alerta) {
    logger.warn({ alertaId }, 'Alerta no existe');
    return;
  }
  if (alerta.estado !== 'ACTIVA') {
    logger.debug({ alertaId, estado: alerta.estado }, 'Alerta no activa, se omite');
    return;
  }

  // "Cualquier fecha": el sondeo rota por el rango en vez de anclarse a un día
  if (alerta.fechaFlexible) {
    await sondearFlexible(alerta, logger);
    return;
  }

  // Trayecto cotidiano: se consulta SIEMPRE el día de hoy (reloj peninsular) en
  // vez de la fecha de creación, para que los avisos se repitan cada día.
  const fechaConsulta = alerta.recurrente
    ? hoyGtfs()
    : alerta.fechaViaje.toISOString().slice(0, 10);

  const consulta: ConsultaDisponibilidad = {
    origenNombre: alerta.origenNombre,
    destinoNombre: alerta.destinoNombre,
    fecha: fechaConsulta,
    horaDesde: alerta.horaDesde,
    horaHasta: alerta.horaHasta,
    numeroTren: alerta.numeroTren,
  };

  const fuente = crearFuenteDatos(alerta.criterio);
  let estado: EstadoDisponibilidad;
  try {
    estado = await fuente.getDisponibilidad(consulta);
  } catch (error) {
    // `ultimoSondeoEn` ya lo ha marcado el claim: el fallo no lo deshace, así
    // que el próximo intento espera el intervalo normal en vez de martillear
    logger.error({ alertaId, err: error }, 'Falló el sondeo');
    throw error;
  }

  // Solo interesan los trenes dentro de la franja horaria de la alerta
  if (consulta.horaDesde || consulta.horaHasta) {
    estado = {
      ...estado,
      trenes: estado.trenes.filter((t) =>
        enFranjaHoraria(t.salida, consulta.horaDesde ?? null, consulta.horaHasta ?? null),
      ),
    };
  }

  const actual = serializarEstado(estado);
  const anterior = Array.isArray(alerta.ultimoEstado)
    ? (alerta.ultimoEstado as unknown as EstadoSerializado[])
    : [];
  const primeraVez = !Array.isArray(alerta.ultimoEstado);
  const avisos = primeraVez ? [] : calcularAvisos(alerta, anterior, actual, fechaConsulta, logger);

  // Estado y avisos se guardan juntos en una única transacción: o se persisten
  // los dos o no se persiste nada (una Notificacion sin estado, o estado sin
  // aviso, dejaría el sondeo y el buzón sin cuadrar).
  await prisma.$transaction([
    prisma.alerta.update({
      where: { id: alerta.id },
      data: {
        ultimoEstado: actual as object,
        ultimoSondeoEn: new Date(),
      },
    }),
    ...avisos.map((aviso) =>
      prisma.notificacion.create({
        data: datosNotificacion(alerta, aviso.titulo, aviso.cuerpo, aviso.datos),
      }),
    ),
  ]);

  // Histórico de precios para DISPONIBILIDAD y PRECIO: los dos se sondean con
  // la fuente de venta (precio disponible). RETRASO/HORARIO/APERTURA_VENTA no
  // tienen precio que seguir. Se registra antes de notificar (y también en el
  // primer sondeo, que luego sale sin comparar) para no perder el punto inicial.
  if (alerta.criterio === 'DISPONIBILIDAD' || alerta.criterio === 'PRECIO') {
    const puntos = await registrarHistorialPrecios(alerta.id, anterior, actual, primeraVez, logger);
    if (puntos > 0) {
      logger.debug({ alertaId, puntos }, 'Histórico de precios actualizado');
    }
  }

  if (primeraVez) {
    logger.debug(
      { alertaId, fuente: fuente.nombre, trenes: actual.length },
      'Primer sondeo, estado guardado',
    );
    return;
  }

  // Los envíos van después del commit y a lo best-effort: el aviso ya está en BD
  for (const aviso of avisos) {
    await enviarPorCanales(
      alerta,
      aviso.titulo,
      aviso.cuerpo,
      logger,
      aviso.email ? { email: true } : undefined,
    );
    logger.info({ alertaId, ...aviso.confirmacion.campos }, aviso.confirmacion.mensaje);
  }
}
