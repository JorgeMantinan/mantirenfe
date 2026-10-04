import type { Logger } from 'pino';
import type { SuscripcionPush } from '@mantirenfe/database';
import * as webpush from 'web-push';

interface PayloadPush {
  title: string;
  body: string;
  url: string;
  tag: string;
}

function estaConfigurado(): boolean {
  return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

export async function enviarPush(
  suscripciones: Array<Pick<SuscripcionPush, 'endpoint' | 'p256dh' | 'auth'>>,
  payload: PayloadPush,
  logger: Logger,
): Promise<void> {
  if (!estaConfigurado() || suscripciones.length === 0) return;

  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT ?? 'mailto:dev@mantirenfe.app',
    process.env.VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  );

  const { getPrisma } = await import('@mantirenfe/database');
  const prisma = getPrisma();

  await Promise.allSettled(
    suscripciones.map(async (suscripcion) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: suscripcion.endpoint,
            keys: { p256dh: suscripcion.p256dh, auth: suscripcion.auth },
          },
          JSON.stringify(payload),
          // TTL 1 h: un aviso de tren caducado no sirve para nada; timeout para
          // que un push service colgado no bloquee el sondeo
          { TTL: 3600, timeout: 10_000 },
        );
      } catch (error) {
        const codigo = (error as { statusCode?: number }).statusCode;
        if (codigo === 404 || codigo === 410) {
          await prisma.suscripcionPush.updateMany({
            where: { endpoint: suscripcion.endpoint },
            data: { activa: false },
          });
          logger.warn({ endpoint: suscripcion.endpoint }, 'Suscripción push caducada, desactivada');
        } else {
          logger.error({ err: error }, 'Error enviando push');
        }
      }
    }),
  );
}
