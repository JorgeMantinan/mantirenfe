import type { Logger } from 'pino';

interface PayloadPush {
  title: string;
  body: string;
  url: string;
  tag: string;
}

export interface TokenPushMovil {
  id: string;
  token: string;
}

const LOTE_MAXIMO = 100;
const URL_EXPO_PUSH = 'https://exp.host/--/api/v2/push/send';

interface TicketExpo {
  status: string;
  details?: { error?: string };
}

/**
 * Envía una notificación a los dispositivos móviles registrados (iOS/Android)
 * a través del Expo Push Service. Desactiva los tokens caducados
 * (DeviceNotRegistered) para no volver a enviarles nada.
 */
export async function enviarPushMovil(
  tokens: TokenPushMovil[],
  payload: PayloadPush,
  logger: Logger,
): Promise<void> {
  if (tokens.length === 0) return;

  const { getPrisma } = await import('@mantirenfe/database');
  const prisma = getPrisma();

  for (let inicio = 0; inicio < tokens.length; inicio += LOTE_MAXIMO) {
    const lote = tokens.slice(inicio, inicio + LOTE_MAXIMO);
    const mensajes = lote.map((t) => ({
      to: t.token,
      sound: 'default',
      title: payload.title,
      body: payload.body,
      data: { url: payload.url, tag: payload.tag },
    }));

    const controlador = new AbortController();
    const timeout = setTimeout(() => controlador.abort(), 15_000);
    try {
      const respuesta = await fetch(URL_EXPO_PUSH, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify(mensajes),
        signal: controlador.signal,
      });
      if (!respuesta.ok) {
        logger.warn({ status: respuesta.status }, 'Expo Push Service rechazó el envío');
        continue;
      }
      const cuerpo = (await respuesta.json()) as {
        data?: TicketExpo[];
        errors?: Array<{ code?: string; message?: string }>;
      };
      if (cuerpo.errors && cuerpo.errors.length > 0) {
        logger.warn({ errors: cuerpo.errors }, 'Errores del Expo Push Service');
        continue;
      }
      for (const [indice, ticket] of (cuerpo.data ?? []).entries()) {
        if (ticket.status === 'error' && ticket.details?.error === 'DeviceNotRegistered') {
          const token = lote[indice]?.token;
          if (!token) continue;
          await prisma.tokenPushMovil.updateMany({
            where: { token },
            data: { activa: false },
          });
          // El token completo no debe salir en los logs (es un secreto del usuario)
          logger.warn({ token: token.slice(0, 12) + '…' }, 'Token móvil caducado, desactivado');
        }
      }
    } catch (error) {
      logger.error({ err: error }, 'Error enviando push móvil');
    } finally {
      clearTimeout(timeout);
    }
  }
}
