import dotenv from 'dotenv';

dotenv.config({ path: '.env' });
dotenv.config({ path: '../../.env' });

import type { Server } from 'node:http';
import pino from 'pino';
import { Queue, Worker } from 'bullmq';
import { getPrisma, Prisma } from '@mantirenfe/database';
import { COLA_SONDEO, COLA_SONDEO_MASIVO, COLA_SYNC_GTFS } from '@mantirenfe/shared-types';
import { sondearAlerta } from './processors/sondeo';
import {
  ahoraRelojGtfs,
  esDiaAplicable,
  hoyGtfs,
  procesarRecordatorios,
  procesarResumenes,
} from './processors/recordatorios';
import { sincronizarEstaciones, sincronizarHorarios } from './processors/sync-gtfs';
import { abrirServicioSalud } from './health-servidor';
import { sincronizarIncidencias } from './processors/incidencias';
import { enviarResumenSemanal } from './processors/resumen-semanal';
import { enviarDigestDiario } from './processors/digest-email';
import { podarNotificaciones } from './notificaciones/poda';
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

/** Tope del cierre ordenado: un recurso que se atasca no bloquea el exit. */
const CIERRE_TIMEOUT_MS = 10_000;

function dormir(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Cierra un worker/cola/servidor esperando como mucho `CIERRE_TIMEOUT_MS`. */
async function cerrarConRecurso(cierre: Promise<unknown>): Promise<void> {
  const blindado = cierre.then(
    () => undefined,
    (err: unknown) => logger.error({ err }, 'Un recurso no se cerró limpiamente'),
  );
  await Promise.race([blindado, dormir(CIERRE_TIMEOUT_MS)]);
}

// Base de la API para el snapshot periódico de posiciones (la persistencia de la
// traza y la puntualidad vive en el GET /trenes/posiciones de la API)
const API_BASE_URL =
  process.env.API_BASE_URL ??
  (process.env.NODE_ENV === 'production'
    ? 'https://mantirenfe.vercel.app/api'
    : 'http://localhost:3000/api');
let minutosDesdeSnapshot = 0;
/** Diagnóstico de OOM de Render: imprime la memoria del worker cada5 barridos (~5 min). */
let contadorMemoriaWorker = 0;

async function snapshotPosiciones(logger: pino.Logger): Promise<void> {
  try {
    const respuesta = await fetch(`${API_BASE_URL}/trenes/posiciones`, {
      signal: AbortSignal.timeout(10_000),
    });
    if (!respuesta.ok) {
      logger.warn({ status: respuesta.status }, 'Snapshot de posiciones: la API respondió error');
    }
  } catch (error) {
    logger.warn({ err: error }, 'Snapshot de posiciones: no se pudo consultar la API');
  }
}

/** Reintentos de los jobs diarios/semanales: un fallo puntual de BD o SMTP no debe perder el aviso. */
const REINTENTOS_PROGRAMADOS = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 60_000 },
} as const;

async function programarTareas(): Promise<Queue[]> {
  const colaMasiva = new Queue(COLA_SONDEO_MASIVO, { connection: conexion });
  colaMasiva.on('error', (err) => {
    logger.error({ err }, 'Error en la cola de sondeo masivo');
  });

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

  // El sync GTFS pesado (ParadaHorario: ~237 MB pico) ya NO corre aquí: lo hace
  // GitHub Actions (`.github/workflows/sync-gtfs.yml`) para no reventar los
  // 512 MB del contenedor de Render (API+worker comparten plan free). El
  // worker de COLA_SYNC_GTFS se mantiene por si se encola manualmente.

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
      ...REINTENTOS_PROGRAMADOS,
    },
  );

  // Digest diario de salidas por email. Los cron de BullMQ son UTC: '0 6 * * *'
  // es las 07:00 de la mañana peninsular en invierno (CET, UTC+1) y las 08:00
  // en verano (CEST, UTC+2) — siempre entre las 7 y las 8, justo antes del
  // resto de avisos del día y sin cambiar el patrón cada cambio de hora.
  await colaMasiva.add(
    'digest-email',
    {},
    {
      repeat: { pattern: '0 6 * * *' },
      jobId: 'digest-email-diario',
      removeOnComplete: 10,
      removeOnFail: 20,
      ...REINTENTOS_PROGRAMADOS,
    },
  );

  // Poda diaria de notificaciones (se conservan 90 días; sin esto la tabla
  // crece sin límite y el histórico acaba pesando más que las alertas)
  await colaMasiva.add(
    'poda-notificaciones',
    {},
    {
      repeat: { pattern: '0 4 * * *' },
      jobId: 'poda-notificaciones-diaria',
      removeOnComplete: 10,
      removeOnFail: 20,
      ...REINTENTOS_PROGRAMADOS,
    },
  );

  logger.info(
    'Tareas repetibles programadas (barrido 1min, incidencias 1min, suprimidos 5min, sync GTFS 04:00, resumen semanal lunes, digest-email 07:00/08:00, poda notificaciones 05:00)',
  );
  return [colaMasiva];
}

async function main() {
  logger.info('Worker MantiRenfe arrancando');

  // Servicio de salud (solo en Render: PORT asignado): el health check mantiene
  // el servicio worker despierto en el plan free y expone su memoria.
  let servidorSalud: Server | null = null;
  if (process.env.PORT) {
    servidorSalud = abrirServicioSalud(Number(process.env.PORT), logger);
    servidorSalud.on('error', (err) => {
      logger.error({ err }, 'Error en el servidor de salud');
    });
  }
  const colas = await programarTareas();

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

      // Mismo queue que el barrido, otro job repetible: el digest de la mañana
      // se manda una sola vez al día (07:00/08:00 peninsular) sin tocar el resto
      if (job.name === 'digest-email') {
        await enviarDigestDiario(logger);
        return;
      }

      // Mismo queue que el barrido, otro job repetible: la poda de
      // notificaciones antiguas corre una vez al día sin tocar el resto
      if (job.name === 'poda-notificaciones') {
        await podarNotificaciones(logger);
        return;
      }

      const prisma = getPrisma();

      // Día peninsular en curso: alimenta el reset de medianoche, el cierre de
      // alertas caducadas y el filtro de "no sondear viajes de otro día"
      const hoyIso = hoyGtfs();
      const hoy00 = new Date(`${hoyIso}T00:00:00Z`);

      // Reset diario de los trayectos recurrentes: al cruzar la medianoche
      // peninsular se limpia el estado y los avisos del día para que cada día
      // haya baseline nuevo y se re-avisen recordatorios y resúmenes.
      try {
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
      // Las recurrentes (trayecto cotidiano) nunca caducan; las de fecha flexible
      // se agotan cuando termina su rango (hoy … hoy + 180 días).
      try {
        const completadas = await prisma.alerta.updateMany({
          where: {
            estado: 'ACTIVA',
            OR: [
              { recurrente: false, fechaFlexible: false, fechaViaje: { lt: hoy00 } },
              { fechaFlexible: true, fechaHasta: { lt: hoy00 } },
            ],
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
      // solo se descartan las de otros días (salvo las recurrentes y las de
      // fecha flexible, que trabajan siempre) y se limita a las más urgentes
      const alertas = await prisma.alerta.findMany({
        where: {
          estado: 'ACTIVA',
          OR: [{ fechaViaje: { gte: hoy00 } }, { recurrente: true }, { fechaFlexible: true }],
        },
        select: {
          id: true,
          ultimoSondeoEn: true,
          intervaloSondeoMin: true,
          recurrente: true,
          diasSemana: true,
          // LEGACY: esDiaAplicable todavía lo lee en filas antiguas
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

        contadorMemoriaWorker += 1;
        if (contadorMemoriaWorker % 5 === 0) {
          const m = process.memoryUsage();
          logger.info(
            {
              rssMb: Math.round(m.rss / 1_048_576),
              heapUsadoMb: Math.round(m.heapUsed / 1_048_576),
            },
            'memoria worker',
          );
        }
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
    // Un EventEmitter 'error' sin listener mata el proceso: se loguea aquí y
    // el cierre ordenado se encarga del resto.
    worker.on('error', (err) => {
      logger.error({ err }, 'Error en el worker');
    });
  }

  let cerrando = false;
  const cerrar = async (senal: string, codigoSalida = 0) => {
    if (cerrando) return;
    cerrando = true;
    logger.info({ senal }, 'Cerrando workers');
    try {
      await Promise.all([
        ...trabajadores.map((w) => cerrarConRecurso(w.close())),
        ...colas.map((c) => cerrarConRecurso(c.close())),
      ]);
      const servidor = servidorSalud;
      if (servidor) {
        await cerrarConRecurso(new Promise<void>((resolve) => servidor.close(() => resolve())));
      }
    } catch (error) {
      logger.error({ err: error }, 'Error durante el cierre del worker');
    } finally {
      try {
        await getPrisma().$disconnect();
      } catch (error) {
        logger.error({ err: error }, 'No se pudo desconectar la base de datos');
      }
      process.exit(codigoSalida);
    }
  };

  process.on('SIGINT', () => void cerrar('SIGINT'));
  process.on('SIGTERM', () => void cerrar('SIGTERM'));
  process.on('unhandledRejection', (motivo) => {
    logger.error({ err: motivo }, 'Promesa rechazada sin manejar');
    void cerrar('unhandledRejection', 1);
  });
  process.on('uncaughtException', (error) => {
    logger.error({ err: error }, 'Excepción no capturada');
    void cerrar('uncaughtException', 1);
  });
}

main().catch((error) => {
  logger.error({ err: error }, 'Worker no pudo arrancar');
  process.exit(1);
});
