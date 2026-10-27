/**
 * Tareas del worker como CLI de un solo disparo (sin Redis ni BullMQ).
 *
 * Cada tarea corre en su propio proceso efímero de GitHub Actions
 * (`.github/workflows/worker.yml`): cron cada 5 min para barrido/incidencias/
 * suprimidos/snapshot y diario/semanal para digest/resumen/poda. Sustituye al
 * worker residente de Render (que consumía ~744 h/mes de las 750 h free del
 * workspace; ver README → Despliegue).
 *
 * Uso:  pnpm --filter @mantirenfe/worker tarea barrido
 *       node dist/... o tsx scripts/tarea.ts incidencias
 */
import dotenv from 'dotenv';
dotenv.config({ path: '.env' });
dotenv.config({ path: '../../.env' });

import pino from 'pino';
import { getPrisma } from '@mantirenfe/database';
import { esPendienteDeSondeo, resetearRecurrentes } from '../src/processors/barrido';
import { sincronizarIncidencias } from '../src/processors/incidencias';
import { persistirSuprimidos } from '../src/processors/suprimidos';
import { enviarResumenSemanal } from '../src/processors/resumen-semanal';
import { enviarDigestDiario } from '../src/processors/digest-email';
import { podarNotificaciones } from '../src/notificaciones/poda';
import {
  ahoraRelojGtfs,
  hoyGtfs,
  procesarRecordatorios,
  procesarResumenes,
} from '../src/processors/recordatorios';
import { sondearAlerta } from '../src/processors/sondeo';
import { esIndisponibilidadDeBaseDeDatos } from '../src/lib/errores-transitorios';

const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  ...(process.env.NODE_ENV !== 'production'
    ? { transport: { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss' } } }
    : {}),
});

/**
 * Un solo reintento (30 s) si el fallo es que la BD no da para más (Supabase
 * sin presupuesto de Disk IO de madrugada): es transitorio y la tirada
 * siguiente lo vuelve a intentar. Los fallos que NO son de disponibilidad se
 * reenvían tal cual para que sigan fallando en rojo.
 */
async function conToleranciaABaseDeDatos(
  nombre: string,
  tarea: () => Promise<void>,
  intentos = 2,
): Promise<void> {
  for (let intento = 1; intento <= intentos; intento++) {
    try {
      await tarea();
      return;
    } catch (error) {
      if (!esIndisponibilidadDeBaseDeDatos(error) || intento === intentos) throw error;
      logger.warn({ err: error, nombre, intento }, 'BD no disponible: se reintenta en 30 s');
      await new Promise((resolver) => setTimeout(resolver, 30_000));
    }
  }
}

/** Reintentos del worker original (REINTENTOS_PROGRAMADOS de main.ts). */
async function conReintentos(
  nombre: string,
  tarea: () => Promise<void>,
  intentos = 3,
): Promise<void> {
  let ultimo: unknown;
  for (let intento = 1; intento <= intentos; intento++) {
    try {
      await tarea();
      return;
    } catch (error) {
      ultimo = error;
      logger.error({ err: error, nombre, intento }, 'Tarea fallida');
      if (intento < intentos) {
        await new Promise((resolver) => setTimeout(resolver, 60_000));
      }
    }
  }
  throw ultimo;
}

/**
 * Barrido de alertas + recordatorios (lo que el worker hacía cada minuto).
 * Sin los gates %15 del proceso residente: con cron de 5 min las operaciones
 * idempotentes (reset de recurrentes, auto-completado) corren en cada tirada —
 * dos UPDATE cada 5 min no son carga para el motor.
 */
async function barrido(): Promise<void> {
  const prisma = getPrisma();
  const hoyIso = hoyGtfs();
  const hoy00 = new Date(`${hoyIso}T00:00:00Z`);

  await resetearRecurrentes(prisma, hoy00, logger);

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
      soloLaborables: true,
    },
    orderBy: [{ ultimoSondeoEn: 'asc' }, { creadaEn: 'asc' }],
    take: 500,
  });

  const ahoraGtfs = ahoraRelojGtfs();
  const pendientes = alertas.filter((a) => esPendienteDeSondeo(a, ahoraGtfs));

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
    if (enviados > 0) logger.info({ enviados }, 'Recordatorios de salida enviados');
    const resumenes = await procesarResumenes(logger);
    if (resumenes > 0) logger.info({ resumenes }, 'Resúmenes de viaje enviados');
  } catch (error) {
    logger.error({ err: error }, 'Fallo en los recordatorios de salida');
  }
}

const TAREAS: Record<string, (logger: pino.Logger) => Promise<void>> = {
  barrido: async (log) => {
    log.info('Barrido de alertas');
    await barrido();
  },
  incidencias: (log) => sincronizarIncidencias(log),
  suprimidos: (log) => persistirSuprimidos(log),
  digest: (log) => conReintentos('digest-email', () => enviarDigestDiario(log)),
  'resumen-semanal': (log) => conReintentos('resumen-semanal', () => enviarResumenSemanal(log)),
  poda: (log) => conReintentos('poda-notificaciones', () => podarNotificaciones(log)),
};

async function main() {
  const nombre = process.argv[2];
  const tarea = nombre ? TAREAS[nombre] : undefined;
  if (!tarea) {
    logger.error(
      { disponibles: Object.keys(TAREAS) },
      'Uso: tarea <nombre> — falta o es desconocido el nombre de la tarea',
    );
    process.exit(1);
  }
  logger.info({ tarea: nombre }, 'Tarea del worker arrancando');
  try {
    await conToleranciaABaseDeDatos(nombre, () => tarea(logger));
    logger.info({ tarea: nombre }, 'Tarea completada');
    process.exit(0);
  } catch (error) {
    if (esIndisponibilidadDeBaseDeDatos(error)) {
      // La BD de Supabase no responde (presupuesto de Disk IO agotado): no es
      // un fallo del worker. Se avisa en amarillo y se sale en 0 para que no
      // salte el correo de "Failed in N seconds" de madrugada ni se tape un
      // fallo REAL (los que no son de disponibilidad siguen saliendo en rojo).
      const aviso = `Tarea «${nombre}» omitida: la base de datos no responde; se repetirá en la próxima tirada`;
      logger.warn({ err: error, tarea: nombre }, aviso);
      if (process.env.GITHUB_ACTIONS) console.error(`::warning::${aviso}`);
      process.exit(0);
    }
    logger.error({ err: error, tarea: nombre }, 'Tarea terminó con error');
    process.exit(1);
  }
}

main();
