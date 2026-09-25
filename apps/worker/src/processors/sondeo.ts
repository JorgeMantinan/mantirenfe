import type { Logger } from 'pino';
import { getPrisma } from '@mantirenfe/database';
import type { ConsultaDisponibilidad, EstadoDisponibilidad } from '@mantirenfe/shared-types';
import { crearFuenteDatos } from '../fuentes';
import { enviarPushMovil } from '../notificaciones/expo-push';
import { enviarPush } from '../notificaciones/web-push';

export interface EstadoSerializado {
  trenId: string;
  numeroTren: string;
  salida: string;
  disponible: boolean;
  precioMin: number | null;
  retrasoSeg?: number | null;
}

export function serializarEstado(estado: EstadoDisponibilidad): EstadoSerializado[] {
  return [...estado.trenes]
    .sort((a, b) => a.trenId.localeCompare(b.trenId))
    .map((t) => ({
      trenId: t.trenId,
      numeroTren: t.numeroTren,
      salida: t.salida,
      disponible: t.disponible,
      precioMin: t.precioMin,
      retrasoSeg: t.retrasoSeg ?? null,
    }));
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

  const consulta: ConsultaDisponibilidad = {
    origenNombre: alerta.origenNombre,
    destinoNombre: alerta.destinoNombre,
    fecha: alerta.fechaViaje.toISOString().slice(0, 10),
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

  if (primeraVez) {
    logger.debug(
      { alertaId, fuente: fuente.nombre, trenes: actual.length },
      'Primer sondeo, estado guardado',
    );
    return;
  }

  const fechaTexto = alerta.fechaViaje.toISOString().slice(0, 10);

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
    const cuerpo = `${alerta.origenNombre} → ${alerta.destinoNombre} el ${fechaTexto}: ${detalle}.`;
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
