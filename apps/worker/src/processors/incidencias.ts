import type { Logger } from 'pino';
import { getPrisma } from '@mantirenfe/database';
import { incidenciaAfectaA, type IncidenciaComparable } from '@mantirenfe/shared-types';
import {
  descargarAlertasGtfsRt,
  parsearAlertasGtfsRt,
  resumirTitulo,
  type AlertaGtfsRt,
} from '../fuentes/gtfs-rt-alertas';
import { hoyGtfs } from './reloj';
import { notificar } from './sondeo';

const URL_ALERTAS_DEFECTO = 'https://gtfsrt.renfe.com/alerts.pb';

/** Tope de estaciones por incidencia (evita tarjetas interminables). */
const LIMITE_ESTACIONES = 20;
/** Nombres de estación tan cortos que harían falsos positivos en el texto. */
const LONGITUD_MINIMA_CLAVE = 4;

/**
 * Clave de búsqueda de zona: sin tildes, sin guiones ni puntuación y con
 * espacios colapsados, para que "San Fernando-Centro" (nombre en la BD) case
 * con "estación de San Fernando Centro" (texto de la alerta).
 */
function normZona(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Tope de incidencias avisadas en un mismo barrido (el feed corre cada 60 s). */
export const LIMITE_INCIDENCIAS_POR_BARRIDO = 5;
export const TITULO_AVISO_INCIDENCIA = 'Incidencia en tu ruta';

/** Incidencia guardada en BD, mínima para poder cruzarla con una alerta. */
export interface IncidenciaNotificable extends IncidenciaComparable {
  id: string;
}

/** Alerta candidata a recibir el aviso (el worker añade después el `usuario`). */
export interface AlertaCandidata {
  id: string;
  origenNombre: string;
  destinoNombre: string;
  incidenciasNotificadas: string[];
}

/** ¿Ya se avisó esta incidencia a esta alerta? (dedupe: 1 aviso por par) */
export function incidenciaYaAvisada(
  incidencia: IncidenciaNotificable,
  alerta: AlertaCandidata,
): boolean {
  return alerta.incidenciasNotificadas.includes(incidencia.id);
}

/**
 * Toca avisar: la incidencia afecta al origen O al destino de la alerta y todavía
 * no está registrada en `incidenciasNotificadas`.
 */
export function debeAvisarIncidencia(
  incidencia: IncidenciaNotificable,
  alerta: AlertaCandidata,
): boolean {
  if (incidenciaYaAvisada(incidencia, alerta)) return false;
  return incidenciaAfectaA(incidencia, [alerta.origenNombre, alerta.destinoNombre]);
}

export function cuerpoAvisoIncidencia(
  incidencia: IncidenciaNotificable,
  alerta: AlertaCandidata,
): string {
  const detalle =
    incidencia.mensaje?.trim() || incidencia.titulo?.trim() || 'Incidencia de servicio';
  return `${detalle} Afecta a tu ruta ${alerta.origenNombre} → ${alerta.destinoNombre}.`;
}

/**
 * Qué se envía en este barrido: incidencias con al menos una alerta pendiente de
 * avisar, sin repetir las ya notificadas y sin superar `limite` incidencias.
 */
export function planificarAvisosDeIncidencias<
  I extends IncidenciaNotificable,
  A extends AlertaCandidata,
>(
  incidencias: readonly I[],
  alertas: readonly A[],
  limite: number = LIMITE_INCIDENCIAS_POR_BARRIDO,
): Array<{ incidencia: I; alertas: A[] }> {
  const avisos: Array<{ incidencia: I; alertas: A[] }> = [];
  for (const incidencia of incidencias) {
    if (avisos.length >= limite) break;
    const afectadas = alertas.filter((alerta) => debeAvisarIncidencia(incidencia, alerta));
    if (afectadas.length > 0) avisos.push({ incidencia, alertas: afectadas });
  }
  return avisos;
}

function urlAlertas(): string {
  return process.env.GTFS_RT_ALERTS_URL?.trim() || URL_ALERTAS_DEFECTO;
}

interface Candidata {
  nombre: string;
  patron: RegExp;
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

  // Búsqueda en texto: se mira el TÍTULO además del mensaje (muchas alertas
  // solo nombran la zona en la cabecera: "entre Lleida-Pirineus i Manresa").
  if (nombres.length === 0) {
    const texto = normZona([alerta.titulo, alerta.mensaje].filter(Boolean).join(' · '));
    for (const candidata of candidatas) {
      if (nombres.length >= LIMITE_ESTACIONES) break;
      if (candidata.patron.test(texto)) agregar(candidata.nombre);
    }
  }

  if (nombres.length === 0) alerta.stopIds.forEach(agregar);
  // �"Solo hay l�nea (C2, RL4, autob�s...)? la zona es la propia l�nea.
  if (nombres.length === 0) alerta.routeIds.forEach((ruta) => agregar(`L�nea ${ruta}`));
  return nombres;
}

function candidatasDe(estaciones: Array<{ nombre: string }>): Candidata[] {
  const candidatas: Candidata[] = [];
  for (const { nombre } of estaciones) {
    const clave = normZona(nombre);
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

  // Se avisa aunque el feed falle: la tabla sigue teniendo las incidencias activas
  await notificarIncidencias(logger);
}

/**
 * Cruza las incidencias activas con las alertas del usuario y envía el push de
 * cada par (incidencia, alerta) que aún no esté registrado en
 * `alerta.incidenciasNotificadas`: 1 aviso por incidencia + alerta, para siempre
 * (las ids no se borran ni al desactivarse la incidencia, así que una
 * reactivación no vuelve a avisar). Corta en `LIMITE_INCIDENCIAS_POR_BARRIDO`
 * incidencias por barrido para no disparar spam; lo que sobre, al siguiente.
 */
export async function notificarIncidencias(logger: Logger): Promise<void> {
  const prisma = getPrisma();
  try {
    // Mínimo necesario para cruzar y redactar el aviso (el feed corre cada 60 s
    // y la tabla histórica crece: no hace falta traerse el resto de columnas)
    const incidencias = await prisma.incidencia.findMany({
      where: { activa: true },
      select: { id: true, titulo: true, mensaje: true, estacionesAfectadas: true },
      orderBy: { actualizadaEn: 'desc' },
      take: 500,
    });
    if (incidencias.length === 0) return;

    // Mismo filtro que el barrido: las no recurrentes solo cuentan si el viaje
    // aún no ha pasado; las recurrentes y las de fecha flexible trabajan siempre.
    const hoy = new Date(`${hoyGtfs()}T00:00:00Z`);
    const alertas = await prisma.alerta.findMany({
      where: {
        estado: 'ACTIVA',
        OR: [{ recurrente: true }, { fechaFlexible: true }, { fechaViaje: { gte: hoy } }],
      },
      select: {
        id: true,
        usuarioId: true,
        origenNombre: true,
        destinoNombre: true,
        fechaViaje: true,
        criterio: true,
        incidenciasNotificadas: true,
        usuario: {
          select: {
            preferencias: true,
            suscripciones: { where: { activa: true } },
            tokensMovil: { where: { activa: true }, select: { id: true, token: true } },
          },
        },
      },
      orderBy: [{ id: 'asc' }],
      take: 500,
    });
    if (alertas.length === 0) return;

    const avisos = planificarAvisosDeIncidencias(incidencias, alertas);
    let enviados = 0;
    for (const { incidencia, alertas: afectadas } of avisos) {
      for (const alerta of afectadas) {
        // Marca ANTES de avisar (y solo si nadie la ha marcado ya entre
        // instancias): el dedupe vive en BD, no en la copia local
        const marcadas = [...alerta.incidenciasNotificadas, incidencia.id];
        const marcado = await prisma.alerta.updateMany({
          where: { id: alerta.id, NOT: { incidenciasNotificadas: { has: incidencia.id } } },
          data: { incidenciasNotificadas: { set: marcadas } },
        });
        if (marcado.count === 0) continue;
        alerta.incidenciasNotificadas = marcadas;

        try {
          await notificar(
            alerta,
            TITULO_AVISO_INCIDENCIA,
            cuerpoAvisoIncidencia(incidencia, alerta),
            { tipo: 'incidencia', incidenciaId: incidencia.id },
            logger,
          );
          enviados++;
        } catch (error) {
          // El aviso se ha perdido: se deshace la marca para reintentarlo en el
          // próximo barrido (la copia local también vuelve atrás)
          alerta.incidenciasNotificadas = alerta.incidenciasNotificadas.filter(
            (id) => id !== incidencia.id,
          );
          try {
            await prisma.alerta.updateMany({
              where: { id: alerta.id },
              data: { incidenciasNotificadas: { set: alerta.incidenciasNotificadas } },
            });
          } catch (deshacer) {
            logger.warn(
              { alertaId: alerta.id, incidenciaId: incidencia.id, err: deshacer },
              'No se pudo deshacer la marca del aviso de incidencia',
            );
          }
          logger.warn(
            { alertaId: alerta.id, incidenciaId: incidencia.id, err: error },
            'Aviso de incidencia no enviado',
          );
        }
      }
    }

    if (enviados > 0) {
      logger.info(
        { incidencias: avisos.length, avisosEnviados: enviados },
        'Avisos de incidencia enviados',
      );
    }
  } catch (error) {
    logger.warn({ err: error }, 'Avisos de incidencia: barrido no completado');
  }
}
