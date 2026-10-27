import dotenv from 'dotenv';

dotenv.config({ path: '.env' });
dotenv.config({ path: '../../.env' });

import pino from 'pino';
import { sincronizarEstaciones, sincronizarHorarios } from '../processors/sync-gtfs';
import { hoyGtfs } from '../processors/reloj';
import { esIndisponibilidadDeBaseDeDatos } from '../lib/errores-transitorios';

/**
 * CLI de sync GTFS para GitHub Actions (`.github/workflows/sync-gtfs.yml`).
 * Mismas funciones que el job repetible de la cola COLA_SYNC_GTFS, pero sin
 * Redis/BullMQ: el pico de memoria (~237 MB con ParadaHorario) se va fuera de
 * Render, donde la API + worker comparten512 MB.
 *
 * Env necesarias: DATABASE_URL (obligatoria). Opcionales: GTFS_DIAS_VENTANA
 * (default en código), GTFS_ZIP_URLS_OUIGO + NAP_API_KEY (Ouigo vía NAP).
 */
const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' });

async function main(): Promise<void> {
  logger.info('CLI sync GTFS: iniciado (node ' + process.version + ')');
  logger.info('CLI: sincronizando estaciones...');
  const estaciones = await sincronizarEstaciones(logger);
  logger.info({ estaciones }, 'CLI: estaciones listas, pasando a horarios');
  const horarios = await sincronizarHorarios(logger);
  logger.info({ estaciones, horarios }, 'Sync GTFS completado (CLI)');
  await podaEspacio();
}

/**
 * Poda diaria de espacio (Supabase free:500MB — ParadaHorario ya ocupa~400MB):
 * sin esto, los horarios de días pasados y los históricos crecen ~15MB/semana
 * y en6 semanas se vuelve a rebasar el límite del plan.
 */
async function podaEspacio(): Promise<void> {
  try {
    const { getPrisma } = await import('@mantirenfe/database');
    const prisma = getPrisma();
    // Día peninsular en curso (mismo reloj que el worker y las tablas GTFS)
    const hoy = new Date(`${hoyGtfs()}T00:00:00Z`);
    const hace90d = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    // El histórico de precios se conserva 45 días (igual que en el sondeo)
    const hace45d = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000);
    const hace12m = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);

    const horarios = await prisma.horarioTren.deleteMany({ where: { fecha: { lt: hoy } } });
    // Solo inactivas: las activas se conservan aunque tengan fechas antiguas
    const incidencias = await prisma.incidencia.deleteMany({
      where: { activa: false, AND: [{ OR: [{ desde: { lt: hace90d } }, { desde: null }] }] },
    });
    const impuntualidad = await prisma.impuntualidadTren.deleteMany({
      where: { fecha: { lt: hace12m } },
    });
    const precio = await prisma.precioTren.deleteMany({
      where: { registradoEn: { lt: hace45d } },
    });
    logger.info(
      {
        horariosPasados: horarios.count,
        incidenciasViejas: incidencias.count,
        impuntualidadVieja: impuntualidad.count,
        preciosViejos: precio.count,
      },
      'Poda de espacio aplicada',
    );
  } catch (error) {
    // La poda nunca debe romper el sync
    logger.warn({ err: error }, 'Poda de espacio falló (continúa)');
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    if (esIndisponibilidadDeBaseDeDatos(error)) {
      // Mismo criterio que el worker: si la BD no da para más no es un fallo
      // del sync (y como es diario, la tirada de mañana lo recupera entero).
      // Se avisa en amarillo para no disparar el correo de "Failed in N
      // seconds" de madrugada ni tapar un fallo REAL de los feeds.
      const aviso =
        'Sync GTFS omitido: la base de datos no responde; se repetirá en la próxima tirada diaria';
      logger.warn({ err: error }, aviso);
      if (process.env.GITHUB_ACTIONS) console.error(`::warning::${aviso}`);
      process.exit(0);
    }
    logger.error({ err: error }, 'Sync GTFS falló');
    process.exit(1);
  });
