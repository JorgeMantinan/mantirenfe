/**
 * Snapshot de posiciones GTFS-RT directo en la BD (sin pasar por el API).
 *
 * Era el `snapshotPosiciones` del worker residente: llamaba al
 * `GET /trenes/posiciones` cada 5 min, lo que mantenía DESPIERTO el API de
 * Render 24/7 (744 h/mes de las 750 h free). Ahora corre en GitHub Actions
 * (repo público = gratis) usando la cadena compartida de
 * `@mantirenfe/shared-types`: feeds → retrasos → persistencia.
 *
 * Uso:  pnpm --filter @mantirenfe/worker snapshot-posiciones
 */
import dotenv from 'dotenv';
dotenv.config({ path: '.env' });
dotenv.config({ path: '../../.env' });

import pino from 'pino';
import { getPrisma } from '@mantirenfe/database';
import { obtenerPosicionesRetrasadas, persistirPosicionesSnapshot } from '@mantirenfe/shared-types';

const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  ...(process.env.NODE_ENV !== 'production'
    ? { transport: { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss' } } }
    : {}),
});

async function main() {
  logger.info('Snapshot de posiciones arrancando');
  const aviso = (mensaje: string) => logger.warn(mensaje);
  const datos = await obtenerPosicionesRetrasadas({ aviso });
  if (datos.length === 0) {
    logger.warn('Sin posiciones (feeds caídos o sin trenes): nada que persistir');
    process.exit(0);
  }
  await persistirPosicionesSnapshot(getPrisma(), datos, aviso);
  logger.info({ total: datos.length }, 'Snapshot de posiciones persistido');
  process.exit(0);
}

main().catch((error) => {
  logger.error({ err: error }, 'Snapshot de posiciones falló');
  process.exit(1);
});
