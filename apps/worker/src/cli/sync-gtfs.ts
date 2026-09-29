import dotenv from 'dotenv';

dotenv.config({ path: '.env' });
dotenv.config({ path: '../../.env' });

import pino from 'pino';
import { sincronizarEstaciones, sincronizarHorarios } from '../processors/sync-gtfs';

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
  const estaciones = await sincronizarEstaciones(logger);
  const horarios = await sincronizarHorarios(logger);
  logger.info({ estaciones, horarios }, 'Sync GTFS completado (CLI)');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    logger.error({ err: error }, 'Sync GTFS falló');
    process.exit(1);
  });
