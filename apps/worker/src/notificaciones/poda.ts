import type { Logger } from 'pino';
import { getPrisma } from '@mantirenfe/database';

/** Días que se conserva una notificación en BD antes de podarla. */
export const DIAS_RETENCION_NOTIFICACIONES = 90;

/**
 * Borra las notificaciones más antiguas que la retención: la tabla solo sirve
 * para el historial reciente del usuario y crece en cada aviso. Si la BD falla,
 * el error sube al job para que BullMQ reintente con backoff.
 */
export async function podarNotificaciones(logger: Logger): Promise<number> {
  const prisma = getPrisma();
  const limite = new Date(Date.now() - DIAS_RETENCION_NOTIFICACIONES * 86_400_000);
  const podadas = await prisma.notificacion.deleteMany({ where: { creadaEn: { lt: limite } } });
  logger.info(
    { borradas: podadas.count, retencionDias: DIAS_RETENCION_NOTIFICACIONES },
    'Notificaciones antiguas podadas',
  );
  return podadas.count;
}
