import dotenv from 'dotenv';

dotenv.config({ path: '.env' });
dotenv.config({ path: '../../.env' });

import pino from 'pino';
import { Worker } from 'bullmq';
import { getPrisma } from '@mantirenfe/database';
import { COLA_SONDEO, COLA_SONDEO_MASIVO, COLA_SYNC_GTFS } from '@mantirenfe/shared-types';
import { sondearAlerta } from './processors/sondeo';
import { sincronizarEstaciones, sincronizarHorarios } from './processors/sync-gtfs';

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

  logger.info('Tareas repetibles programadas (barrido 1min, sync GTFS diario 04:00)');
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
    async () => {
      const prisma = getPrisma();
      const desde = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const alertas = await prisma.alerta.findMany({
        where: {
          estado: 'ACTIVA',
          OR: [{ ultimoSondeoEn: null }, { ultimoSondeoEn: { lt: desde } }],
          fechaViaje: { gte: new Date(new Date().toISOString().slice(0, 10)) },
        },
        select: { id: true, ultimoSondeoEn: true, intervaloSondeoMin: true },
        take: 200,
      });

      const pendientes = alertas.filter((a) => {
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
