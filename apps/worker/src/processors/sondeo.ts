import type { Logger } from 'pino';
import { getPrisma } from '@mantirenfe/database';
import {
  funcionIndemnizacion,
  horaGtfs,
  type ConsultaDisponibilidad,
  type EstadoDisponibilidad,
  type EstadoSerializado,
} from '@mantirenfe/shared-types';
import { crearFuenteDatos } from '../fuentes';
import { enviarPushMovil } from '../notificaciones/expo-push';
import { enviarPush } from '../notificaciones/web-push';
import { hoyGtfs } from './reloj';

// El tipo vive en shared-types (lo consumen la API, la web y el móvil);
// se re-exporta aquí para no romper a nadie que lo importara de este fichero.
export type { EstadoSerializado };

export function serializarEstado(estado: EstadoDisponibilidad): EstadoSerializado[] {
  return [...estado.trenes]
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

export function pushHabilitado(preferencias: unknown): boolean {
  let valor: unknown = preferencias;
  if (typeof valor === 'string') {
    try {
      valor = JSON.parse(valor);
    } catch {
      return true;
    }
  }
  if (valor && typeof valor === 'object') {
    return (valor as { notificacionesPush?: boolean }).notificacionesPush !== false;
  }
  return true;
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

/** Cifra en € sin símbolo: 42.5 → "42,5", 30 → "30". */
function euros(valor: number): string {
  return valor.toLocaleString('es-ES', { maximumFractionDigits: 2 });
}

export function textoPrecioBajo(tren: EstadoSerializado, precioObjetivo: number): string {
  const numero = tren.numeroTren || tren.trenId;
  const precio = typeof tren.precioMin === 'number' ? euros(tren.precioMin) : '—';
  return `Precio: ${numero} ${horaGtfs(tren.salida)} a ${precio} € (objetivo ≤ ${euros(precioObjetivo)} €)`;
}

export async function notificar(
  alerta: {
    id: string;
    usuarioId: string;
    origenNombre: string;
    destinoNombre: string;
    fechaViaje: Date;
    criterio: string;
    usuario: {
      preferencias: unknown;
      suscripciones: Array<{ endpoint: string; p256dh: string; auth: string }>;
      tokensMovil: Array<{ id: string; token: string }>;
    };
  },
  titulo: string,
  cuerpo: string,
  datosExtra: Record<string, unknown>,
  logger: Logger,
): Promise<void> {
  const prisma = getPrisma();
  await prisma.notificacion.create({
    data: {
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
    },
  });

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
}

export async function sondearAlerta(alertaId: string, logger: Logger): Promise<void> {
  const prisma = getPrisma();
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
    logger.error({ alertaId, err: error }, 'Falló el sondeo');
    await prisma.alerta.update({
      where: { id: alerta.id },
      data: { ultimoSondeoEn: new Date() },
    });
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

  await prisma.alerta.update({
    where: { id: alerta.id },
    data: {
      ultimoEstado: actual as object,
      ultimoSondeoEn: new Date(),
    },
  });

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

  const fechaTexto = fechaConsulta;

  if (criterioCoincide(alerta, 'DISPONIBILIDAD')) {
    const { aparecen } = diffDisponibles(anterior, actual);
    if (aparecen.length === 0) {
      logger.debug({ alertaId }, 'Sin cambios de disponibilidad');
      return;
    }
    const titulos = aparecen
      .map((t) => `${t.salida}${t.numeroTren ? ` (${t.numeroTren})` : ''}`)
      .join(', ');
    const titulo = '¡Plaza disponible!';
    const cuerpo = `Queda disponibilidad en ${alerta.origenNombre} → ${alerta.destinoNombre} el ${fechaTexto}: ${titulos}.`;
    await notificar(alerta, titulo, cuerpo, { trenes: aparecen.map((t) => t.trenId) }, logger);
    logger.info({ alertaId, trenes: aparecen.length }, 'Notificación de disponibilidad enviada');
    return;
  }

  if (criterioCoincide(alerta, 'PRECIO')) {
    const precioObjetivo = alerta.precioObjetivo;
    if (typeof precioObjetivo !== 'number') {
      logger.warn({ alertaId }, 'Alerta de precio sin precioObjetivo, se omite');
      return;
    }
    const bajos = nuevosBajoObjetivo(anterior, actual, precioObjetivo);
    if (bajos.length === 0) {
      logger.debug({ alertaId }, 'Sin trenes bajo el precio objetivo');
      return;
    }
    const cuerpo = bajos.map((t) => textoPrecioBajo(t, precioObjetivo)).join(' · ');
    const titulo = 'Precio bajo tu objetivo';
    await notificar(
      alerta,
      titulo,
      cuerpo,
      {
        tipo: 'precio',
        precioObjetivo,
        trenes: bajos.map((t) => t.trenId),
      },
      logger,
    );
    logger.info(
      { alertaId, trenes: bajos.length, precioObjetivo },
      'Notificación de precio enviada',
    );
    return;
  }

  if (alerta.criterio === 'HORARIO') {
    const { nuevos, salidos, cambiados } = diffHorarios(anterior, actual);
    if (nuevos.length === 0 && salidos.length === 0 && cambiados.length === 0) {
      logger.debug({ alertaId }, 'Sin cambios de horario');
      return;
    }
    const detalle = [
      nuevos.length > 0 ? `${nuevos.length} nueva(s) salida(s)` : null,
      cambiados.length > 0 ? `${cambiados.length} hora(s) modificada(s)` : null,
      salidos.length > 0 ? `${salidos.length} servicio(s) retirado(s)` : null,
    ]
      .filter(Boolean)
      .join(', ');
    const titulo = 'Cambio de horario';
    const cuerpo = `Horario actualizado en ${alerta.origenNombre} → ${alerta.destinoNombre} el ${fechaTexto}: ${detalle}.`;
    await notificar(
      alerta,
      titulo,
      cuerpo,
      {
        nuevos: nuevos.map((t) => t.trenId),
        cambiados: cambiados.map((t) => t.trenId),
        salidos: salidos.map((t) => t.trenId),
      },
      logger,
    );
    logger.info({ alertaId, detalle }, 'Notificación de horario enviada');
    return;
  }

  if (alerta.criterio === 'RETRASO') {
    const cancelaciones = nuevosCancelados(anterior, actual);
    if (cancelaciones.length > 0) {
      const cuerpo = cancelaciones.map(textoCancelacion).join(' · ');
      await notificar(
        alerta,
        'Tren cancelado',
        cuerpo,
        {
          tipo: 'cancelacion',
          numeroTren: cancelaciones.map((t) => t.numeroTren || t.trenId).join(', '),
          trenes: cancelaciones.map((t) => t.trenId),
        },
        logger,
      );
      logger.info(
        { alertaId, trenes: cancelaciones.length },
        'Notificación de cancelación enviada',
      );
    }

    // Un tren cancelado ya avisa por su cuenta: no se duplica con "no para en"
    const suprimidas = nuevasParadasSuprimidas(anterior, actual).filter(
      (s) => s.tren.cancelado !== true,
    );
    if (suprimidas.length > 0) {
      const cuerpo = suprimidas
        .flatMap((s) => s.estaciones.map((estacion) => textoParadaSuprimida(s.tren, estacion)))
        .join(' · ');
      await notificar(
        alerta,
        'Tu tren no para hoy',
        cuerpo,
        {
          tipo: 'parada_suprimida',
          trenes: suprimidas.map((s) => s.tren.trenId),
          estaciones: [...new Set(suprimidas.flatMap((s) => s.estaciones))],
        },
        logger,
      );
      logger.info(
        { alertaId, trenes: suprimidas.length },
        'Notificación de parada suprimida enviada',
      );
    }

    const umbral = Number(process.env.RETRASO_UMBRAL_SEG ?? 300);
    const retrasados = filtrarRetrasados(actual, umbral);
    const previos = new Set(
      (anterior as EstadoSerializado[])
        .filter((t) => typeof t.retrasoSeg === 'number' && t.retrasoSeg >= umbral)
        .map((t) => t.trenId),
    );
    const nuevosRetrasos = retrasados.filter((t) => !previos.has(t.trenId));
    if (nuevosRetrasos.length === 0) {
      logger.debug({ alertaId }, 'Sin retrasos nuevos sobre umbral');
      return;
    }
    const detalle = nuevosRetrasos
      .map((t) => {
        const min = Math.round((t.retrasoSeg ?? 0) / 60);
        return `${t.numeroTren || t.trenId} (+${min} min)`;
      })
      .join(', ');
    const titulo = 'Retraso en tu tren';
    const maxRetrasoDelGrupo = Math.max(...nuevosRetrasos.map((t) => t.retrasoSeg ?? 0));
    const cuerpo = `${alerta.origenNombre} → ${alerta.destinoNombre} el ${fechaTexto}: ${detalle}.${textoIndemnizacion(maxRetrasoDelGrupo)}`;
    await notificar(
      alerta,
      titulo,
      cuerpo,
      { trenes: nuevosRetrasos.map((t) => t.trenId) },
      logger,
    );
    logger.info({ alertaId, trenes: nuevosRetrasos.length }, 'Notificación de retraso enviada');
    return;
  }

  logger.debug({ alertaId, criterio: alerta.criterio }, 'Criterio sin notificación');
}
