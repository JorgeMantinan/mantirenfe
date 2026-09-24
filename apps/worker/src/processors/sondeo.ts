import type { Logger } from 'pino';
import { getPrisma } from '@mantirenfe/database';
import type { ConsultaDisponibilidad, EstadoDisponibilidad } from '@mantirenfe/shared-types';
import { crearFuenteDatos } from '../fuentes';
import { enviarPush } from '../notificaciones/web-push';

function serializarEstado(estado: EstadoDisponibilidad) {
  return [...estado.trenes]
    .sort((a, b) => a.trenId.localeCompare(b.trenId))
    .map((t) => ({
      trenId: t.trenId,
      numeroTren: t.numeroTren,
      salida: t.salida,
      disponible: t.disponible,
      precioMin: t.precioMin,
    }));
}

function diffDisponibles(
  anterior: ReturnType<typeof serializarEstado>,
  actual: ReturnType<typeof serializarEstado>,
) {
  const antes = new Map(anterior.map((t) => [t.trenId, t.disponible]));
  const aparecen: typeof actual = [];
  const desaparecen: typeof actual = [];

  for (const tren of actual) {
    const previo = antes.get(tren.trenId);
    if (previo === false && tren.disponible) aparecen.push(tren);
    if (previo === true && !tren.disponible) desaparecen.push(tren);
    antes.delete(tren.trenId);
  }
  return { aparecen, desaparecen };
}

export async function sondearAlerta(alertaId: string, logger: Logger): Promise<void> {
  const prisma = getPrisma();
  const alerta = await prisma.alerta.findUnique({
    where: { id: alertaId },
    include: { usuario: { include: { suscripciones: { where: { activa: true } } } } },
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

  const fuente = crearFuenteDatos();
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

  const actual = serializarEstado(estado);
  const anterior = Array.isArray(alerta.ultimoEstado)
    ? (alerta.ultimoEstado as ReturnType<typeof serializarEstado>)
    : [];
  const primeraVez = !Array.isArray(alerta.ultimoEstado);
  const { aparecen } = diffDisponibles(anterior, actual);

  await prisma.alerta.update({
    where: { id: alerta.id },
    data: {
      ultimoEstado: actual as object,
      ultimoSondeoEn: new Date(),
    },
  });

  if (primeraVez || aparecen.length === 0) {
    logger.debug(
      { alertaId, fuente: fuente.nombre, trenes: actual.length },
      primeraVez ? 'Primer sondeo, estado guardado' : 'Sin cambios relevantes',
    );
    return;
  }

  if (alerta.criterio === 'DISPONIBILIDAD' || alerta.criterio === 'APERTURA_VENTA') {
    const titulos = aparecen
      .map((t) => `${t.salida}${t.numeroTren ? ` (${t.numeroTren})` : ''}`)
      .join(', ');
    const titulo = '¡Plaza disponible!';
    const cuerpo = `Queda disponibilidad en ${alerta.origenNombre} → ${alerta.destinoNombre} el ${alerta.fechaViaje.toISOString().slice(0, 10)}: ${titulos}.`;

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
          trenes: aparecen.map((t) => t.trenId),
          url: `/alertas/${alerta.id}`,
        },
      },
    });

    await enviarPush(
      alerta.usuario.suscripciones,
      { title: titulo, body: cuerpo, url: `/alertas/${alerta.id}`, tag: `alerta-${alerta.id}` },
      logger,
    );

    logger.info({ alertaId, trenes: aparecen.length }, 'Notificación de disponibilidad enviada');
  }
}
