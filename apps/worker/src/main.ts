import dotenv from 'dotenv';

dotenv.config({ path: '.env' });
dotenv.config({ path: '../../.env' });

import pino from 'pino';
import { Worker } from 'bullmq';
import { getPrisma, Prisma } from '@mantirenfe/database';
import { COLA_SONDEO, COLA_SONDEO_MASIVO, COLA_SYNC_GTFS } from '@mantirenfe/shared-types';
import { sondearAlerta } from './processors/sondeo';
import {
  ahoraRelojGtfs,
  esDiaAplicable,
  procesarRecordatorios,
  procesarResumenes,
} from './processors/recordatorios';
import { sincronizarEstaciones, sincronizarHorarios } from './processors/sync-gtfs';
import { sincronizarIncidencias } from './processors/incidencias';
import { enviarResumenSemanal } from './processors/resumen-semanal';
import { persistirSuprimidos } from './processors/suprimidos';

const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  ...(process.env.NODE_ENV !== 'production'
    ? { transport: { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss' } } }
    : {}),
});

const conexion = {
  url: process.env.REDIS_URL ?? 'redis://localhost:6379',
  maxRetriesPerRequest: null as null,
};

// Base de la API para el snapshot periódico de posiciones (la persistencia de la
// traza y la puntualidad vive en el GET /trenes/posiciones de la API)
const API_BASE_URL =
  process.env.API_BASE_URL ??
  (process.env.NODE_ENV === 'production'
    ? 'https://mantirenfe.vercel.app/api'
    : 'http://localhost:3000/api');
let minutosDesdeSnapshot = 0;

async function snapshotPosiciones(logger: pino.Logger): Promise<void> {
  try {
    const respuesta = await fetch(`${API_BASE_URL}/trenes/posiciones`);
    if (!respuesta.ok) {
      logger.warn({ status: respuesta.status }, 'Snapshot de posiciones: la API respondió error');
    }
  } catch (error) {
    logger.warn({ err: error }, 'Snapshot de posiciones: no se pudo consultar la API');
  }
}

async function programarTareas() {
  const { Queue } = await import('bullmq');
  const colaSondeo = new Queue(COLA_SONDEO, { connection: conexion });
  const colaMasiva = new Queue(COLA_SONDEO_MASIVO, { connection: conexion });
  const colaSync = new Queue(COLA_SYNC_GTFS, { connection: conexion });

  await colaMasiva.add(
    'barrido',
    {},
    {
      repeat: { pattern: '*/1 * * * *' },
      jobId: 'barrido-alertas-activas',
      removeOnComplete: 50,
      removeOnFail: 100,
    },
  );

  await colaSync.add(
    'sync-gtfs',
    {},
    {
      repeat: { pattern: '0 4 * * *' },
      jobId: 'sync-gtfs-diario',
      removeOnComplete: 20,
      removeOnFail: 50,
    },
  );

  // Incidencias de servicio (alerts.pb, el feed se renueva cada 20 s)
  await colaMasiva.add(
    'incidencias',
    {},
    {
      repeat: { pattern: '*/1 * * * *' },
      jobId: 'incidencias-gtfs-rt',
      removeOnComplete: 50,
      removeOnFail: 100,
    },
  );

  // Trenes suprimidos (trip_updates CANCELED). Cadencia de 5 min: el feed se
  // renueva cada 15-30 s, pero la tabla es histórica (upsert + poda de 7 días)
  // y no hace falta martillearlo.
  await colaMasiva.add(
    'suprimidos',
    {},
    {
      repeat: { pattern: '*/5 * * * *' },
      jobId: 'suprimidos-gtfs-rt',
      removeOnComplete: 50,
      removeOnFail: 100,
    },
  );

  // Resumen semanal por push. Los cron de BullMQ son UTC: '0 8 * * 1' es lunes
  // 09:00 peninsular en invierno y 10:00 en verano — siempre lunes por la mañana
  // peninsular sin tener que cambiar el patrón cada cambio de hora.
  await colaMasiva.add(
    'resumen-semanal',
    {},
    {
      repeat: { pattern: '0 8 * * 1' },
      jobId: 'resumen-semanal-lunes',
      removeOnComplete: 10,
      removeOnFail: 20,
    },
  );

  logger.info(
    'Tareas repetibles programadas (barrido 1min, incidencias 1min, suprimidos 5min, sync GTFS 04:00, resumen semanal lunes)',
  );
  return { colaSondeo, colaMasiva, colaSync };
}

async function main() {
  logger.info('Worker MantiRenfe arrancando');
  await programarTareas();

  const workerSondeo = new Worker(
    COLA_SONDEO,
    async (job) => {
      const alertaId = job.data.alertaId as string;
      await sondearAlerta(alertaId, logger);
    },
    { connection: conexion, concurrency: 5 },
  );

  const workerMasivo = new Worker(
    COLA_SONDEO_MASIVO,
    async (job) => {
      // Mismo queue que el barrido, otro job repetible: las incidencias de
      // servicio se refrescan solas cada minuto sin tocar el resto
      if (job.name === 'incidencias') {
        await sincronizarIncidencias(logger);
        return;
      }

      // Mismo queue que el barrido, otro job repetible: los trenes suprimidos
      // se persisten cada 5 min sin tocar el resto
      if (job.name === 'suprimidos') {
        await persistirSuprimidos(logger);
        return;
      }

      // Mismo queue que el barrido, otro job repetible: el resumen semanal se
      // ejecuta una vez por semana (lunes por la mañana) sin tocar el resto
      if (job.name === 'resumen-semanal') {
        await enviarResumenSemanal(logger);
        return;
      }

      const prisma = getPrisma();

      // Reset diario de los trayectos recurrentes: al cruzar la medianoche
      // peninsular se limpia el estado y los avisos del día para que cada día
      // haya baseline nuevo y se re-avisen recordatorios y resúmenes.
      try {
        const hoy00 = new Date(`${ahoraRelojGtfs().toISOString().slice(0, 10)}T00:00:00Z`);
        const reseteadas = await prisma.alerta.updateMany({
          where: {
            recurrente: true,
            estado: 'ACTIVA',
            ultimoSondeoEn: { lt: hoy00 },
            NOT: { ultimoSondeoEn: null },
          },
          data: {
            ultimoEstado: Prisma.JsonNull,
            ultimoSondeoEn: null,
            recordatorioTrenesEnviados: [],
            recordatorioEnviadoEn: null,
            resumenEnviadoEn: null,
          },
        });
        if (reseteadas.count > 0) {
          logger.info({ reseteadas: reseteadas.count }, 'Alertas recurrentes reiniciadas hoy');
        }
      } catch (error) {
        logger.error({ err: error }, 'Fallo reiniciando alertas recurrentes');
      }

      // Snapshot de posiciones cada ~5 min: aunque nadie abra el mapa, la traza
      // y la puntualidad siguen registrándose (dispara la persistencia de la API)
      minutosDesdeSnapshot += 1;
      if (minutosDesdeSnapshot % 5 === 0) {
        await snapshotPosiciones(logger);
      }

      // Las alertas cuyo viaje ya pasó se completan solas (no se vuelven a sondear).
      // Las recurrentes (trayecto cotidiano) nunca caducan.
      try {
        const hoyIso = ahoraRelojGtfs().toISOString().slice(0, 10);
        const completadas = await prisma.alerta.updateMany({
          where: {
            estado: 'ACTIVA',
            recurrente: false,
            fechaViaje: { lt: new Date(`${hoyIso}T00:00:00Z`) },
          },
          data: { estado: 'COMPLETADA' },
        });
        if (completadas.count > 0) {
          logger.info({ completadas: completadas.count }, 'Alertas con fecha pasada completadas');
        }
      } catch (error) {
        logger.error({ err: error }, 'Fallo completando alertas caducadas');
      }

      // El filtro por intervaloSondeoMin se aplica en memoria más abajo: en SQL
      // solo se descartan las de otros días (salvo las recurrentes, que trabajan
      // siempre) y se limita a las más urgentes
      const alertas = await prisma.alerta.findMany({
        where: {
          estado: 'ACTIVA',
          OR: [
            { fechaViaje: { gte: new Date(new Date().toISOString().slice(0, 10)) } },
            { recurrente: true },
          ],
        },
        select: {
          id: true,
          ultimoSondeoEn: true,
          intervaloSondeoMin: true,
          recurrente: true,
          soloLaborables: true,
        },
        orderBy: [{ ultimoSondeoEn: 'asc' }, { creadaEn: 'asc' }],
        take: 500,
      });

      const ahoraGtfs = ahoraRelojGtfs();
      const pendientes = alertas.filter((a) => {
        if (!esDiaAplicable(a, ahoraGtfs)) return false;
        if (!a.ultimoSondeoEn) return true;
        return Date.now() - a.ultimoSondeoEn.getTime() >= a.intervaloSondeoMin * 60_000;
      });

      for (const alerta of pendientes) {
        try {
          await sondearAlerta(alerta.id, logger);
        } catch (error) {
          logger.error({ alertaId: alerta.id, err: error }, 'Fallo en barrido');
        }
      }
      if (pendientes.length > 0) {
        logger.info({ procesadas: pendientes.length }, 'Barrido de alertas completado');
      }

      try {
        const enviados = await procesarRecordatorios(logger);
        if (enviados > 0) {
          logger.info({ enviados }, 'Recordatorios de salida enviados');
        }
        const resumenes = await procesarResumenes(logger);
        if (resumenes > 0) {
          logger.info({ resumenes }, 'Resúmenes de viaje enviados');
        }
      } catch (error) {
        logger.error({ err: error }, 'Fallo en los recordatorios de salida');
      }
    },
    { connection: conexion, concurrency: 1 },
  );

  const workerSync = new Worker(
    COLA_SYNC_GTFS,
    async () => {
      await sincronizarEstaciones(logger);
      await sincronizarHorarios(logger);
    },
    { connection: conexion, concurrency: 1 },
  );

  const trabajadores = [workerSondeo, workerMasivo, workerSync];
  for (const worker of trabajadores) {
    worker.on('failed', (job, err) => {
      logger.error({ jobId: job?.id, err }, 'Job fallido');
    });
  }

  const cerrar = async (senal: string) => {
    logger.info({ senal }, 'Cerrando workers');
    await Promise.all(trabajadores.map((w) => w.close()));
    await getPrisma().$disconnect();
    process.exit(0);
  };

  process.on('SIGINT', () => void cerrar('SIGINT'));
  process.on('SIGTERM', () => void cerrar('SIGTERM'));
}

main().catch((error) => {
  logger.error({ err: error }, 'Worker no pudo arrancar');
  process.exit(1);
});
