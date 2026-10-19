import type { Logger } from 'pino';
import { getPrisma } from '@mantirenfe/database';
import {
  funcionIndemnizacion,
  horaGtfs,
  horaATimeNoNula,
  horaComoTexto,
  HORIZONTE_FLEXIBLE_DIAS,
  type ConsultaDisponibilidad,
  type EstadoDisponibilidad,
  type EstadoSerializado,
} from '@mantirenfe/shared-types';
import { crearFuenteDatos } from '../fuentes';
import {
  ENLACE_MIN_DEFECTO,
  cargarDatosItinerario,
  componerItinerarios,
  type Itinerario,
  type TramoItinerario,
} from '../fuentes/itinerarios';
import { coincideNumeroTren, deduplicarTrenes } from '@mantirenfe/venta';
import { enviarEmail } from '../notificaciones/email';
import { enviarPushMovil } from '../notificaciones/expo-push';
import { preferenciaBooleana } from '../notificaciones/preferencias';
import { pushHabilitado } from '../notificaciones/util';
import { enviarPush } from '../notificaciones/web-push';
import { hoyGtfs, proximoDiaAplicable } from './reloj';

// El tipo vive en shared-types (lo consumen la API, la web y el móvil);
// se re-exporta aquí para no romper a nadie que lo importara de este fichero.
export type { EstadoSerializado };

// Mismo criterio que el resumen semanal: una sola implementación en
// notificaciones/util.ts, re-exportada para los tests de este fichero.
export { pushHabilitado };

/**
 * Etiqueta con la que el worker guarda la serie de un criterio en
 * `ultimoEstado`. Los criterios que comparten fuente de datos (p. ej.
 * DISPONIBILIDAD y PRECIO, los dos en la venta) consultan lo mismo y comparan
 * contra la MISMA serie: se etiquetan con el primero de su grupo para no
 * duplicar filas en `ultimoEstado`. Criterios de fuentes distintas
 * (RETRASO/GTFS-RT, HORARIO/BD) guardan su propia serie.
 */
export function etiquetaEstado(criterio: string, criterios: readonly string[]): string {
  const grupo = fuenteDeCriterio(criterio);
  return criterios.find((c) => fuenteDeCriterio(c) === grupo) ?? criterio;
}

/** Criterios que comparten fuente de datos: se consulta cada fuente UNA vez. */
function fuenteDeCriterio(criterio: string): 'RETRASO' | 'HORARIO' | 'VENTA' {
  if (criterio === 'RETRASO') return 'RETRASO';
  if (criterio === 'HORARIO') return 'HORARIO';
  return 'VENTA';
}

/**
 * Criterios vigilados de una alerta. Con `criterios` manda la lista
 * (multi-criterio); sin ella, la alerta es legada y vigila solo `criterio`.
 *
 * DISPONIBILIDAD y APERTURA_VENTA comparan exactamente lo mismo (la venta), así
 * que si están las dos se evalúa solo una: dos avisos idénticos por sondeo no
 * le sirven a nadie.
 */
export function criteriosDeAlerta(alerta: {
  criterio: string;
  criterios?: readonly string[] | null;
}): string[] {
  const lista =
    alerta.criterios && alerta.criterios.length > 0 ? [...alerta.criterios] : [alerta.criterio];
  return lista.includes('DISPONIBILIDAD') ? lista.filter((c) => c !== 'APERTURA_VENTA') : lista;
}

export function serializarEstado(
  estado: EstadoDisponibilidad,
  criterio?: string,
): EstadoSerializado[] {
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
      // Multi-criterio: cada fila se asocia al criterio cuya serie es
      if (criterio) serializado.criterio = criterio;
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

/**
 * `ultimoEstado` agrupado por la etiqueta de criterio que lo etiquetó al
 * guardarlo. Las filas SIN `criterio` (estado escrito por versiones anteriores)
 * se asignan al criterio legado de la alerta: es el único que existía entonces,
 * así el diff de una alerta antigua sigue comparando contra lo suyo.
 */
export function estadoAnteriorPorCriterio(
  bruto: unknown,
  criterioLegado: string,
): Map<string, EstadoSerializado[]> {
  const porEtiqueta = new Map<string, EstadoSerializado[]>();
  if (!Array.isArray(bruto)) return porEtiqueta;
  for (const item of bruto) {
    if (!item || typeof item !== 'object') continue;
    const fila = item as EstadoSerializado;
    if (typeof fila.trenId !== 'string' || typeof fila.salida !== 'string') continue;
    const etiqueta =
      typeof fila.criterio === 'string' && fila.criterio ? fila.criterio : criterioLegado;
    const lista = porEtiqueta.get(etiqueta);
    if (lista) lista.push(fila);
    else porEtiqueta.set(etiqueta, [fila]);
  }
  return porEtiqueta;
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
        // Columna @db.Time: 'HH:MM' (o un ISO de los estados antiguos) → Date
        salida: horaATimeNoNula(t.salida),
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

/** ¿Este criterio se evalúa con la regla `codigo`? (APERTURA_VENTA = venta) */
function criterioCoincide(criterio: string, codigo: string): boolean {
  if (criterio === codigo) return true;
  if (codigo === 'DISPONIBILIDAD') return criterio === 'APERTURA_VENTA';
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
 * (`@mantirenfe/venta`), así que re-sondear una fecha recién vista no vuelve a
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
  // Lista multi-criterio (opcional: las alertas legadas solo traen `criterio`)
  criterios?: readonly string[] | null;
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
 * Avisos de UN criterio marcados con el criterio que los disparó: viaja en
 * `Notificacion.datos` para poder distinguirlos en el buzón de una alerta
 * multi-criterio.
 */
/**
 * Sondeos consecutivos sin plaza que declaran un tren AGOTADO de verdad. La
 * fuente de Renfe oscila (el mismo tren entra y sale de la búsqueda o marca
 * `disponible: false` durante unos minutos), así que un par de sondeos en
 * negro no son un cambio real. Al llegar al umbral la fila pasa a
 * `disponible: false` y, si la plaza vuelve, el diff la vuelve a avisar.
 */
export const SONDEOS_AGOTAR_PLAZA = 3;

/**
 * JSON canónico (claves ordenadas, sin depender del orden que imponga jsonb
 * al leer) para comparar estados: si un sondeo no ha cambiado NADA, el estado
 * no se reescribe — es el mismo blob de unos KB por alerta y cada ciclo, y el
 * Disk IO de Supabase (presupuesto aparte del egress) se va en esas escrituras.
 */
export function canonico(valor: unknown): string {
  if (Array.isArray(valor)) return `[${valor.map(canonico).join(',')}]`;
  if (valor && typeof valor === 'object') {
    const entradas = Object.entries(valor as Record<string, unknown>).sort(([a], [b]) =>
      a < b ? -1 : a > b ? 1 : 0,
    );
    return `{${entradas.map(([k, v]) => `${JSON.stringify(k)}:${canonico(v)}`).join(',')}}`;
  }
  return JSON.stringify(valor) ?? 'null';
}

/**
 * Serie de disponibilidad MONOTONA: mientras la fuente no lo declare agotado,
 * una vez un tren se ha visto con plaza (disponible=true) se conserva así
 * aunque la fuente lo omita o lo marque como no disponible en un sondeo
 * posterior (la venta oscila: trenes entran y salen de la búsqueda y el mismo
 * tren se re-avisaba cada pocos minutos). Los trenes NUEVOS que llegan con
 * plaza siguen saltando al diff al instante, y un tren observado sin plaza
 * SONDEOS_AGOTAR_PLAZA veces seguidas queda agotado: si la plaza vuelve, el
 * diff reavisa. Las filas de escala no se arrastran (las gestiona
 * evaluarConexiones).
 *
 * Con `programa` (trayecto cotidiano o cualquier fecha) las filas agotadas NO
 * se caen nunca: de noche la búsqueda se vacía y, sin esto, el estado quedaba
 * en [] — «sin datos» en las tarjetas hasta que el feed volvía por la mañana.
 * Conservado como horario, tarjetas y widget enseñan de noche ya la salida de
 * mañana, y al amanecer el diff (false → true) vuelve a avisar de las plazas.
 */
export function estabilizarSerieVenta(
  anterior: EstadoSerializado[],
  actual: EstadoSerializado[],
  opciones: { programa?: boolean } = {},
): EstadoSerializado[] {
  const { programa = false } = opciones;
  const previas = new Map(anterior.filter((f) => !esFilaEscala(f)).map((f) => [f.trenId, f]));
  const vistas = new Set<string>();
  const salida = actual.map((f) => {
    vistas.add(f.trenId);
    const previa = previas.get(f.trenId);
    if (f.disponible) {
      // Con plaza: fila fresca de la fuente sin contador (se reinicia). Si la
      // previa estaba agotada, el diff la ve pasar de false a true y reavisa.
      return f;
    }
    if (!previa?.disponible) return f; // nunca tuvo plaza (o ya estaba agotada)
    const sondeos = (previa.sondeosSinPlaza ?? 0) + 1;
    return sondeos >= SONDEOS_AGOTAR_PLAZA
      ? f // agotado de verdad: la siguiente plaza saltará al diff
      : { ...previa, sondeosSinPlaza: sondeos }; // oscilación: se conserva la plaza vista
  });
  for (const previa of previas.values()) {
    if (vistas.has(previa.trenId)) continue;
    if (!previa.disponible) {
      // Con `programa` las filas agotadas se conservan como horario (no se
      // caen con el feed vacío de noche); sin programa, fuera.
      if (programa) salida.push({ ...previa });
      continue;
    }
    const sondeos = (previa.sondeosSinPlaza ?? 0) + 1;
    salida.push(
      sondeos >= SONDEOS_AGOTAR_PLAZA
        ? { ...previa, disponible: false, sondeosSinPlaza: 0 }
        : { ...previa, sondeosSinPlaza: sondeos },
    );
  }
  return salida;
}

function calcularAvisosDeCriterio(
  alerta: AvisoAlerta & { precioObjetivo: number | null },
  criterio: string,
  anterior: EstadoSerializado[],
  actual: EstadoSerializado[],
  fechaTexto: string,
  logger: Logger,
): AvisoSondeo[] {
  return avisosDeCriterio(alerta, criterio, anterior, actual, fechaTexto, logger).map((aviso) => ({
    ...aviso,
    datos: { ...aviso.datos, criterio },
  }));
}

/**
 * Avisos que toca enviar al comparar el estado anterior con el actual de UN
 * criterio concreto (vacío si no hay cambios). Cada criterio de la alerta se
 * evalúa por su cuenta con su propia serie, así que "plazas" y "retrasos" de la
 * misma alerta son avisos independientes. Solo se calculan aquí: el estado de
 * la alerta y las `Notificacion` se guardan después juntos, en una única
 * transacción, y los envíos van tras el commit.
 */
function avisosDeCriterio(
  alerta: AvisoAlerta & { precioObjetivo: number | null },
  criterio: string,
  anterior: EstadoSerializado[],
  actual: EstadoSerializado[],
  fechaTexto: string,
  logger: Logger,
): AvisoSondeo[] {
  const avisos: AvisoSondeo[] = [];
  const alertaId = alerta.id;

  if (criterioCoincide(criterio, 'DISPONIBILIDAD')) {
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

  if (criterioCoincide(criterio, 'PRECIO')) {
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

  if (criterio === 'HORARIO') {
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

  if (criterio === 'RETRASO') {
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

  logger.debug({ alertaId, criterio }, 'Criterio sin notificación');
  return avisos;
}

// ──────────────────────────────── conexiones (1 escala) ────────────────────────────────

/** Nº máximo de itinerarios con escala que evalúa cada sondeo (≤ 10 consultas). */
export const MAX_ITINERARIOS_ESCALA = 5;

/**
 * Identificador de un itinerario con escala dentro de `ultimoEstado`
 * (`escala|<tripA>|<tripB>`): el diff compara el `trenId` tal cual, así que el
 * aviso solo salta cuando cambia la disponibilidad o cambia el itinerario
 * ganador, no en cada sondeo. Lleva el prefijo para que la fila siga siendo
 * legible en el estado guardado (se distingue al instante de las de la venta).
 */
export const PREFIJO_ESCALA = 'escala|';

/** ¿Es la fila sintética de una escala (frente a las filas de la venta)? */
export function esFilaEscala(fila: { trenId: string }): boolean {
  return fila.trenId.startsWith(PREFIJO_ESCALA);
}

/** Minutos peninsulares de una hora HH:MM; undefined si no viene o no vale. */
export function minutosDeHora(hora: string | null | undefined): number | undefined {
  if (!hora || !/^([01]\d|2[0-3]):[0-5]\d$/.test(hora)) return undefined;
  return Number(hora.slice(0, 2)) * 60 + Number(hora.slice(3, 5));
}

/**
 * HH:MM de unos minutos peninsulares. Los minutos pueden pasar de 1440 en
 * servicios que acaban tras la medianoche (1500 → "01:00"), así que se dan la
 * vuelta sobre el día de servicio.
 */
export function textoHoraMin(minutos: number): string {
  const resto = ((Math.trunc(minutos) % 1440) + 1440) % 1440;
  return `${String(Math.floor(resto / 60)).padStart(2, '0')}:${String(resto % 60).padStart(2, '0')}`;
}

/**
 * Cuerpo del aviso de una escala con plazas: los dos tramos con su hora,
 * estación y número de tren, y la llegada al destino. Los avisos del worker
 * van en español directo (como el resto): no pasan por el i18n de la app.
 *
 * Ejemplo: `Plazas en tu ida con escala: 09:00 A Coruña→Santiago (09183) +
 * 09:30 Santiago→Vigo (09701), llegada 11:05 · A Coruña → Vigo el 5 de octubre`
 */
export function textoEscala(
  itinerario: Itinerario,
  nombres: ReadonlyMap<string, string>,
  ruta: string,
  fechaTexto: string,
): string {
  const ida = itinerario.tramos[0];
  const segunda = itinerario.tramos[1];
  if (!ida || !segunda) return ruta;
  const nombre = (id: string): string => nombres.get(id) ?? id;
  const detalle = [
    `${textoHoraMin(ida.salidaMin)} ${nombre(ida.estacionOrigenId)}→${nombre(ida.estacionDestinoId)} (${ida.numeroTren})`,
    `${textoHoraMin(segunda.salidaMin)} ${nombre(segunda.estacionOrigenId)}→${nombre(segunda.estacionDestinoId)} (${segunda.numeroTren})`,
  ].join(' + ');
  return `Plazas en tu ida con escala: ${detalle}, llegada ${textoHoraMin(segunda.llegadaMin)} · ${ruta} el ${fechaTexto}`;
}

/** Fila de estado de una escala con plazas (serie del criterio de la venta). */
function filaEscala(
  itinerario: Itinerario,
  nombres: ReadonlyMap<string, string>,
  criterio: string,
): EstadoSerializado | null {
  const ida = itinerario.tramos[0];
  const segunda = itinerario.tramos[1];
  if (!ida || !segunda) return null;
  return {
    trenId: `${PREFIJO_ESCALA}${ida.tripId}|${segunda.tripId}`,
    numeroTren: `${ida.numeroTren} + ${segunda.numeroTren}`,
    salida: textoHoraMin(ida.salidaMin),
    disponible: true,
    precioMin: null,
    retrasoSeg: null,
    cancelado: false,
    criterio,
    tramo: 'conexion',
    conexionEn: nombres.get(ida.estacionDestinoId) ?? ida.estacionDestinoId,
    conexionLlegada: textoHoraMin(ida.llegadaMin),
    conexionSalida: textoHoraMin(segunda.salidaMin),
    esperaMin: Math.max(0, segunda.salidaMin - ida.llegadaMin),
    horaLlegada: textoHoraMin(segunda.llegadaMin),
    duracionMin: Math.max(1, segunda.llegadaMin - ida.salidaMin),
  };
}

/** Resultado de evaluar la rama de conexiones de UN sondeo. */
interface ResultadoConexiones {
  /** Fila de escala a añadir a la serie (null = no hay escala con plazas). */
  fila: EstadoSerializado | null;
  /** Aviso a persistir con el estado (null = no ha cambiado nada). */
  aviso: AvisoSondeo | null;
}

/**
 * Rama de conexiones (1 escala) del criterio DISPONIBILIDAD.
 *
 * Solo se entra con `Alerta.conexiones` marcado. Flujo:
 *  1. Si los DIRECTOS ya tienen plazas, el criterio se resuelve como siempre y
 *     la escala no se mira (así no se duplica el aviso).
 *  2. Si no, se componen itinerarios con 1 escala (GTFS en memoria) respetando
 *    la franja de la alerta y se comprueba la disponibilidad de los trenes de
 *     cada tramo.
 *  3. La venta solo responde por par origen-destino: "consultar por tren" es
 *     pedir la ruta del tramo con `numeroTren` (el mismo camino que una alerta
 *     con tren concreto) y quedarse con ese tren. La caché single-flight de la
 *     fuente comparte la consulta real entre todos los itinerarios que usen el
 *     mismo tramo, así que son como mucho `MAX_ITINERARIOS_ESCALA * 2` pares
 *     (y se corta en el primer itinerario con ambos tramos disponibles).
 *  4. El itinerario ganador se guarda como fila de la serie con `trenId`
 *     `escala|<tripA>|<tripB>`: el diff solo vuelve a avisar si cambian los
 *     trips o la disponibilidad, no en cada sondeo.
 *
 * Un fallo aquí no puede romper el sondeo (los directos ya se han evaluado): se
 * conserva la fila anterior y no se avisa.
 */
async function evaluarConexiones(
  prisma: ReturnType<typeof getPrisma>,
  alerta: {
    id: string;
    origenNombre: string;
    destinoNombre: string;
    origenEstacionId: string | null;
    destinoEstacionId: string | null;
    // Columna @db.Time: Date en las filas reales, string en los mocks de test
    horaDesde: Date | string | null;
    horaHasta: Date | string | null;
  },
  etiqueta: string,
  serieDirecta: EstadoSerializado[],
  previa: EstadoSerializado | undefined,
  fechaConsulta: string,
  fechaTexto: string,
  logger: Logger,
): Promise<ResultadoConexiones> {
  const vacio: ResultadoConexiones = { fila: null, aviso: null };

  if (serieDirecta.some((t) => t.disponible && t.cancelado !== true)) {
    logger.debug({ alertaId: alerta.id }, 'Directo con plazas: sin evaluar la escala');
    return vacio;
  }
  const origenId = alerta.origenEstacionId;
  const destinoId = alerta.destinoEstacionId;
  if (!origenId || !destinoId) {
    logger.debug({ alertaId: alerta.id }, 'Ruta sin estaciones resueltas: sin escala');
    return vacio;
  }

  try {
    const datos = await cargarDatosItinerario(prisma, {
      origenId,
      destinoId,
      fechaIso: fechaConsulta,
    });
    const candidatos = componerItinerarios({
      horarios: datos.horarios,
      paradas: datos.paradas,
      origenId,
      destinoId,
      enlaceMin: ENLACE_MIN_DEFECTO,
      // La franja de la alerta: desde sobre la SALIDA del primer tramo y hasta
      // sobre la LLEGADA total (como define `componerItinerarios`).
      franjaDesdeMin: minutosDeHora(horaComoTexto(alerta.horaDesde)),
      franjaHastaMin: minutosDeHora(horaComoTexto(alerta.horaHasta)),
      maxResultados: MAX_ITINERARIOS_ESCALA,
    }).filter((it) => it.tipo === 'escala');
    if (candidatos.length === 0) {
      logger.debug({ alertaId: alerta.id }, 'Sin itinerarios con escala para el día');
      return vacio;
    }

    const ids = [
      ...new Set(
        candidatos.flatMap((it) =>
          it.tramos.flatMap((t) => [t.estacionOrigenId, t.estacionDestinoId]),
        ),
      ),
    ];
    const filas = await prisma.estacion.findMany({
      where: { id: { in: ids } },
      select: { id: true, nombre: true },
    });
    const nombres = new Map(filas.map((e) => [e.id, e.nombre]));
    const evaluables = candidatos.filter((it) =>
      it.tramos.every((t) => nombres.has(t.estacionOrigenId) && nombres.has(t.estacionDestinoId)),
    );
    if (evaluables.length === 0) return vacio;

    const fuente = crearFuenteDatos(etiqueta);
    const consultadas = new Map<string, boolean>();

    /** ¿La venta tiene plazas de ESTE tren en ESTE tramo? (ver punto 3) */
    const tramoConPlazas = async (tramo: TramoItinerario): Promise<boolean> => {
      const clave = `${tramo.estacionOrigenId}|${tramo.estacionDestinoId}|${tramo.numeroTren}`;
      const previo = consultadas.get(clave);
      if (previo !== undefined) return previo;
      const origenNombre = nombres.get(tramo.estacionOrigenId);
      const destinoNombre = nombres.get(tramo.estacionDestinoId);
      if (!origenNombre || !destinoNombre) return false;
      const estado = await fuente.getDisponibilidad({
        origenNombre,
        destinoNombre,
        fecha: fechaConsulta,
        numeroTren: tramo.numeroTren,
      });
      // Solo cuenta si la venta lista ESE tren como servicio suelto con plazas:
      // una fila de combinación (2 tramos) no garantiza billete por tramo.
      const disponible = estado.trenes.some(
        (t) =>
          coincideNumeroTren(t.numeroTren, tramo.numeroTren) &&
          t.tramo !== 'conexion' &&
          t.disponible &&
          t.cancelado !== true,
      );
      consultadas.set(clave, disponible);
      return disponible;
    };

    let ganador: Itinerario | null = null;
    for (const candidato of evaluables) {
      const [ida, segunda] = candidato.tramos;
      if (!ida || !segunda) continue;
      if ((await tramoConPlazas(ida)) && (await tramoConPlazas(segunda))) {
        ganador = candidato;
        break;
      }
    }
    if (!ganador) {
      logger.debug({ alertaId: alerta.id }, 'Ninguna escala con los dos tramos con plazas');
      return vacio;
    }

    const fila = filaEscala(ganador, nombres, etiqueta);
    if (!fila) return vacio;
    // Sin cambios (mismos trips y ya estaba disponible): no se reavisa
    if (previa && previa.trenId === fila.trenId && previa.disponible === true) {
      return { fila, aviso: null };
    }
    return {
      fila,
      aviso: {
        titulo: '¡Plaza disponible con escala!',
        cuerpo: textoEscala(
          ganador,
          nombres,
          `${alerta.origenNombre} → ${alerta.destinoNombre}`,
          fechaTexto,
        ),
        datos: { tipo: 'escala', trenes: [fila.trenId], criterio: etiqueta },
        email: true,
        confirmacion: {
          mensaje: 'Notificación de disponibilidad con escala enviada',
          campos: { trenes: 1 },
        },
      },
    };
  } catch (error) {
    // Los directos ya se han evaluado: la escala es mejor esfuerzo. Se
    // conserva la fila anterior para que un fallo transitorio no la borre (y
    // no se reavise cuando vuelva la misma escala).
    logger.warn({ alertaId: alerta.id, err: error }, 'No se pudo evaluar la escala');
    return { fila: previa ?? null, aviso: null };
  }
}

/** Campos de una alerta flexible: lo que lee `sondearFlexible`. */
type AlertaFlexible = Parameters<typeof notificar>[0] & {
  // Columna @db.Time: Date en las filas reales, string en los mocks de test
  horaDesde: Date | string | null;
  horaHasta: Date | string | null;
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
  // La rotación por fechas es del criterio (primero) de la alerta: es el que
  // escoge la fuente y el que etiqueta el estado que se guarda para el detalle.
  const criterios = criteriosDeAlerta(alerta);
  const fuente = crearFuenteDatos(criterios[0] ?? alerta.criterio);
  // Franja horaria: columnas @db.Time (Date) normalizadas a texto HH:MM una
  // sola vez para todas las fechas del rango.
  const franjaDesde = horaComoTexto(alerta.horaDesde);
  const franjaHasta = horaComoTexto(alerta.horaHasta);

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
        horaDesde: franjaDesde,
        horaHasta: franjaHasta,
        numeroTren: alerta.numeroTren,
      });
      serie = serializarEstado(consultada, criterios[0] ?? alerta.criterio);
    } catch (error) {
      logger.warn({ alertaId: alerta.id, fecha, err: error }, 'Fecha del rango sin sondear');
      continue;
    }
    if (franjaDesde || franjaHasta) {
      serie = serie.filter((t) => enFranjaHoraria(t.salida, franjaDesde, franjaHasta));
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
        criterio: criterios[0] ?? alerta.criterio,
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

/**
 * `ultimoEstado` (el JSON grande de cada alerta) vive en memoria por proceso:
 * solo el worker lo escribe, y si la API lo resetea o edita la alerta cambia
 * otro campo de la fila, cosa que invalida la huella y fuerza una lectura
 * fresca. Antes se re-descargaba de Supabase en CADA sondeo: era de los
 * mayores consumidores de egress y el cuota free ya se ha comido (6,3 GB/5 GB).
 */
const cacheEstadoAlerta = new Map<string, { huella: string; estado: unknown }>();

/** Vacia la caché de estado (solo para los tests, que comparten el módulo). */
export function reiniciarCacheEstadoAlerta(): void {
  cacheEstadoAlerta.clear();
}

/** JSON de la fila SIN el sello del sondeo (que cambia en cada ciclo). */
function huellaFilaAlerta(fila: object): string {
  const { ultimoSondeoEn: _sello, ...resto } = fila as Record<string, unknown>;
  return JSON.stringify(resto);
}

/** Estado cacheado de la alerta; solo vuelve a leerlo si la fila ha cambiado. */
async function ultimoEstadoAlerta(
  prisma: ReturnType<typeof getPrisma>,
  alertaId: string,
  fila: object,
): Promise<unknown> {
  const huella = huellaFilaAlerta(fila);
  const cacheado = cacheEstadoAlerta.get(alertaId);
  if (cacheado && cacheado.huella === huella) return cacheado.estado;
  const sola = await prisma.alerta.findUnique({
    where: { id: alertaId },
    select: { ultimoEstado: true },
  });
  const estado = sola?.ultimoEstado ?? null;
  cacheEstadoAlerta.set(alertaId, { huella, estado });
  return estado;
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

  const fila = await prisma.alerta.findUnique({
    where: { id: alertaId },
    // El JSON de estado no viaja aquí: lo trae `ultimoEstadoAlerta` (caché)
    omit: { ultimoEstado: true },
    include: {
      usuario: {
        include: {
          suscripciones: { where: { activa: true } },
          tokensMovil: { where: { activa: true }, select: { id: true, token: true } },
        },
      },
    },
  });

  if (!fila) {
    logger.warn({ alertaId }, 'Alerta no existe');
    cacheEstadoAlerta.delete(alertaId);
    return;
  }
  if (fila.estado !== 'ACTIVA') {
    logger.debug({ alertaId, estado: fila.estado }, 'Alerta no activa, se omite');
    return;
  }
  const alerta = { ...fila, ultimoEstado: await ultimoEstadoAlerta(prisma, alertaId, fila) };

  // "Cualquier fecha": el sondeo rota por el rango en vez de anclarse a un día
  if (alerta.fechaFlexible) {
    await sondearFlexible(alerta, logger);
    return;
  }

  // Fecha objetivo del trayecto cotidiano CON días marcados: se trabaja cualquier
  // día evaluando el próximo día marcado (un martes mira el viernes), para avisar
  // en cuanto haya plaza para ese viernes/domingo; sin días marcados se consulta el
  // día de hoy (reloj peninsular) y lo puntual, su fecha de viaje.
  const fechaObjetivo = alerta.recurrente
    ? proximoDiaAplicable(alerta, new Date(`${hoyGtfs()}T00:00:00Z`))
    : alerta.fechaViaje;
  const fechaConsulta = fechaObjetivo.toISOString().slice(0, 10);

  // ¿La fecha objetivo cambia desde el último estado guardado? (el viernes
  // evaluado pasa a ser el siguiente tras completarse, o cambia el día de hoy
  // en una recurrente sin días). El estado anterior es entonces de OTROS
  // trenes: compararlo mandaría avisos falsos (todas las filas parecerían
  // "nuevas" o "baratas") y ocultaría la transición real, así que se trata
  // como primer sondeo: línea base de la fecha nueva y sin avisos.
  const objetivoCambio =
    alerta.recurrente &&
    (alerta.fechaObjetivoSondeo ? alerta.fechaObjetivoSondeo.toISOString().slice(0, 10) : null) !==
      fechaConsulta;

  const consulta: ConsultaDisponibilidad = {
    origenNombre: alerta.origenNombre,
    destinoNombre: alerta.destinoNombre,
    fecha: fechaConsulta,
    // Columnas @db.Time: el resto del worker (y las fuentes) comparan HH:MM
    horaDesde: horaComoTexto(alerta.horaDesde),
    horaHasta: horaComoTexto(alerta.horaHasta),
    numeroTren: alerta.numeroTren,
  };

  // Multi-criterio: cada criterio se evalúa con su propia serie y contra SU
  // estado anterior. Los que comparten fuente (p. ej. DISPONIBILIDAD y PRECIO)
  // se consultan UNA vez y comparan contra la MISMA serie, así que
  // `ultimoEstado` no guarda filas duplicadas ni se pisan los diffs.
  const criterios = criteriosDeAlerta(alerta);
  const etiquetas = [...new Set(criterios.map((c) => etiquetaEstado(c, criterios)))];

  const anteriores = estadoAnteriorPorCriterio(alerta.ultimoEstado, alerta.criterio);
  const etiquetaVenta = etiquetaEstado('DISPONIBILIDAD', criterios);

  const series = new Map<string, EstadoSerializado[]>();
  for (const etiqueta of etiquetas) {
    const fuente = crearFuenteDatos(etiqueta);
    let estado: EstadoDisponibilidad;
    try {
      estado = await fuente.getDisponibilidad(consulta);
    } catch (error) {
      // `ultimoSondeoEn` ya lo ha marcado el claim: el fallo no lo deshace, así
      // que el próximo intento espera el intervalo normal en vez de martillear
      logger.error({ alertaId, criterio: etiqueta, err: error }, 'Falló el sondeo');
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
    const filas = serializarEstado(estado, etiqueta);
    // La serie de venta es monotona (ver estabilizarSerieVenta): evita que la
    // oscilación de la fuente re-avise del mismo tren; el diff sigue saltando
    // al instante con los trenes NUEVOS que llegan con plaza.
    series.set(
      etiqueta,
      etiqueta === etiquetaVenta
        ? estabilizarSerieVenta(anteriores.get(etiqueta) ?? [], filas, {
            // Cotidiano/flexible: el horario se repite, la serie no se vacía
            programa: alerta.recurrente || alerta.fechaFlexible,
          })
        : filas,
    );
  }

  const primeraVez = !Array.isArray(alerta.ultimoEstado) || objetivoCambio;
  if (objetivoCambio) {
    logger.debug(
      { alertaId, fechaObjetivo: fechaConsulta, previa: alerta.fechaObjetivoSondeo ?? null },
      'Fecha objetivo nueva: el estado anterior se usa como línea base',
    );
  }

  // Conexiones (1 escala): solo con DISPONIBILIDAD vigilado y la casilla
  // marcada. La fila del itinerario ganador se añade a la serie del criterio de
  // venta, de modo que el diff, el detalle y el histórico la ven como una fila
  // más (el diff no la reavisa: su `trenId` identifica los trips ganadores).
  let avisoEscala: AvisoSondeo | null = null;
  if (alerta.conexiones && criterios.includes('DISPONIBILIDAD')) {
    const etiqueta = etiquetaEstado('DISPONIBILIDAD', criterios);
    const serie = series.get(etiqueta);
    if (serie) {
      const previa = (anteriores.get(etiqueta) ?? []).find(esFilaEscala);
      const rama = await evaluarConexiones(
        prisma,
        alerta,
        etiqueta,
        serie,
        previa,
        fechaConsulta,
        fechaConsulta,
        logger,
      );
      if (rama.fila) serie.push(rama.fila);
      // El primer sondeo solo deja estado (línea base), igual que los directos
      avisoEscala = primeraVez ? null : rama.aviso;
    }
  }

  const actual = etiquetas.flatMap((etiqueta) => series.get(etiqueta) ?? []);

  // Un aviso por criterio que haya cambiado: los que salgan de aquí se
  // persisten TODOS en la misma transacción de abajo.
  const avisos = primeraVez
    ? []
    : criterios.flatMap((criterio) =>
        calcularAvisosDeCriterio(
          alerta,
          criterio,
          anteriores.get(etiquetaEstado(criterio, criterios)) ?? [],
          series.get(etiquetaEstado(criterio, criterios)) ?? [],
          fechaConsulta,
          logger,
        ),
      );
  if (avisoEscala) avisos.push(avisoEscala);

  // Estado y avisos se guardan juntos en una única transacción: o se persisten
  // los dos o no se persiste nada (una Notificacion sin estado, o estado sin
  // aviso, dejaría el sondeo y el buzón sin cuadrar). El JSON del estado solo
  // se escribe si algo ha cambiado de verdad (canonico): con N alertas cada
  // pocos minutos era el mayor generador de escrituras (Disk IO).
  const estadoCambia = canonico(actual) !== canonico(alerta.ultimoEstado ?? null);
  await prisma.$transaction([
    prisma.alerta.update({
      where: { id: alerta.id },
      data: {
        ...(estadoCambia ? { ultimoEstado: actual as object } : {}),
        ultimoSondeoEn: new Date(),
        // Se guarda con el estado y en la MISMA transacción: los dos hablan de
        // la misma fecha, que es lo que permite detectar el cambio de fecha
        // objetivo en el próximo sondeo (nunca se compara estado de otro día)
        fechaObjetivoSondeo: new Date(`${fechaConsulta}T00:00:00Z`),
      },
    }),
    ...avisos.map((aviso) =>
      prisma.notificacion.create({
        data: datosNotificacion(alerta, aviso.titulo, aviso.cuerpo, aviso.datos),
      }),
    ),
  ]);
  // El estado recién guardado pasa a la caché: el próximo sondeo no lo vuelve
  // a descargar de Supabase mientras la fila no cambie por otro lado.
  const cacheadoEstado = cacheEstadoAlerta.get(alertaId);
  if (cacheadoEstado) {
    cacheEstadoAlerta.set(alertaId, { ...cacheadoEstado, estado: actual });
  }

  // Histórico de precios para DISPONIBILIDAD y PRECIO: los dos se sondean con
  // la fuente de venta (precio disponible). RETRASO/HORARIO/APERTURA_VENTA no
  // tienen precio que seguir. Se registra antes de notificar (y también en el
  // primer sondeo, que luego sale sin comparar) para no perder el punto inicial.
  // Va una sola vez por la serie de la venta, aunque la vigilen dos criterios.
  const criterioPrecio = criterios.find((c) => c === 'DISPONIBILIDAD' || c === 'PRECIO');
  if (criterioPrecio) {
    const etiquetaPrecio = etiquetaEstado(criterioPrecio, criterios);
    // La fila de escala no es un tren con precio: se excluye para que no entre
    // en el histórico (su `precioMin` es null y solo ensuciaría la gráfica).
    const sinEscalas = (filas: EstadoSerializado[]) => filas.filter((f) => !esFilaEscala(f));
    const puntos = await registrarHistorialPrecios(
      alerta.id,
      sinEscalas(anteriores.get(etiquetaPrecio) ?? []),
      sinEscalas(series.get(etiquetaPrecio) ?? []),
      primeraVez,
      logger,
    );
    if (puntos > 0) {
      logger.debug({ alertaId, puntos }, 'Histórico de precios actualizado');
    }
  }

  if (primeraVez) {
    logger.debug({ alertaId, criterios, trenes: actual.length }, 'Primer sondeo, estado guardado');
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
