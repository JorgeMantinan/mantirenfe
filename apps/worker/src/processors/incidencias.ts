import type { Logger } from 'pino';
import { getPrisma, normalizarTexto } from '@mantirenfe/database';
import {
  descargarAlertasGtfsRt,
  parsearAlertasGtfsRt,
  resumirTitulo,
  type AlertaGtfsRt,
} from '../fuentes/gtfs-rt-alertas';

const URL_ALERTAS_DEFECTO = 'https://gtfsrt.renfe.com/alerts.pb';

/** Tope de estaciones por incidencia (evita tarjetas interminables). */
const LIMITE_ESTACIONES = 20;
/** Nombres de estación tan cortos que harían falsos positivos en el texto. */
const LONGITUD_MINIMA_CLAVE = 4;

interface Candidata {
  nombre: string;
  patron: RegExp;
}

function urlAlertas(): string {
  return process.env.GTFS_RT_ALERTS_URL?.trim() || URL_ALERTAS_DEFECTO;
}

function escapar(texto: string): string {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Estaciones de una alerta:
 * 1. informed_entity.stop_id -> nombre de la estación (el código GTFS es el
 *    `codigo` de la tabla Estacion, igual que en la sincronización de horarios).
 * 2. Si no hay mapeo directo, se busca el nombre de estación normalizado
 *    (sin tildes, minúsculas) como palabra suelta dentro del mensaje.
 * 3. Si tampoco hay nada, se conservan los stop_id crudos para no perder info.
 */
function estacionesAfectadas(
  alerta: AlertaGtfsRt,
  porCodigo: Map<string, string>,
  candidatas: Candidata[],
): string[] {
  const nombres: string[] = [];
  const vistos = new Set<string>();
  const agregar = (nombre: string) => {
    if (!vistos.has(nombre) && nombres.length < LIMITE_ESTACIONES) {
      vistos.add(nombre);
      nombres.push(nombre);
    }
  };

  const resueltas: string[] = [];
  for (const stopId of alerta.stopIds) {
    const nombre = porCodigo.get(stopId);
    if (nombre) resueltas.push(nombre);
  }
  resueltas.forEach(agregar);

  if (nombres.length === 0 && alerta.mensaje) {
    const mensaje = normalizarTexto(alerta.mensaje);
    for (const candidata of candidatas) {
      if (nombres.length >= LIMITE_ESTACIONES) break;
      if (candidata.patron.test(mensaje)) agregar(candidata.nombre);
    }
  }

  if (nombres.length === 0) alerta.stopIds.forEach(agregar);
  return nombres;
}

function candidatasDe(estaciones: Array<{ nombre: string }>): Candidata[] {
  const candidatas: Candidata[] = [];
  for (const { nombre } of estaciones) {
    const clave = normalizarTexto(nombre);
    if (clave.length < LONGITUD_MINIMA_CLAVE) continue;
    candidatas.push({
      nombre,
      patron: new RegExp(`(?:^|[^a-z0-9])${escapar(clave)}(?:[^a-z0-9]|$)`),
    });
  }
  return candidatas;
}

/**
 * Descarga alerts.pb, lo parsea y lo refleja en la tabla Incidencia:
 * upsert por id de alerta y `activa = false` para las que ya no aparecen.
 * Cualquier error (red, protobuf, BD) se loguea como warn y no rompe el ciclo.
 */
export async function sincronizarIncidencias(logger: Logger): Promise<void> {
  const url = urlAlertas();
  try {
    const datos = await descargarAlertasGtfsRt(url);
    const alertas = parsearAlertasGtfsRt(datos);
    const prisma = getPrisma();

    const porCodigo = new Map<string, string>();
    let candidatas: Candidata[] = [];
    if (alertas.length > 0) {
      const estaciones = await prisma.estacion.findMany({
        select: { codigo: true, nombre: true },
      });
      for (const estacion of estaciones) porCodigo.set(estacion.codigo, estacion.nombre);
      candidatas = candidatasDe(estaciones);
    }

    const vigentes = new Set<string>();
    for (const alerta of alertas) {
      if (vigentes.has(alerta.id)) continue;
      vigentes.add(alerta.id);

      const titulo = alerta.titulo ?? resumirTitulo(alerta.mensaje);
      const datosIncidencia = {
        titulo,
        mensaje: alerta.mensaje,
        causa: alerta.causa,
        estacionesAfectadas: estacionesAfectadas(alerta, porCodigo, candidatas),
        desde: alerta.desde,
        hasta: alerta.hasta,
      };

      try {
        await prisma.incidencia.upsert({
          where: { id: alerta.id },
          update: { ...datosIncidencia, activa: true, actualizadaEn: new Date() },
          create: { id: alerta.id, ...datosIncidencia, activa: true },
        });
      } catch (error) {
        logger.warn({ incidenciaId: alerta.id, err: error }, 'Incidencia no guardada');
      }
    }

    // Las que ya no vienen en el feed se marcan como inactivas (no se borran:
    // así el histórico sigue siendo consultable)
    const desactivadas = await prisma.incidencia.updateMany({
      where: { activa: true, ...(vigentes.size > 0 ? { id: { notIn: [...vigentes] } } : {}) },
      data: { activa: false },
    });

    logger.info(
      { recibidas: alertas.length, activas: vigentes.size, desactivadas: desactivadas.count },
      'Incidencias GTFS-RT sincronizadas',
    );
  } catch (error) {
    logger.warn({ url, err: error }, 'Incidencias GTFS-RT: no se pudo actualizar el feed');
  }
}
