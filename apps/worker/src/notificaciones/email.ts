import type { Logger } from 'pino';
import { createTransport } from 'nodemailer';

const TIMEOUT_MS = 10_000;
const PUERTO_SMTPS = 465;
const PUERTO_POR_DEFECTO = 587;
const DESDE_POR_DEFECTO = 'no-reply@mantirenfe.vercel.app';
const URL_RESEND = 'https://api.resend.com/emails';

let avisoFaltaConfigurado = false;

/** Hay servidor al que conectarse: sin host o sin contraseña no se envía nada. */
export function emailConfigurado(): boolean {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_PASS);
}

function puertoSmtp(): number {
  const puerto = Number(process.env.SMTP_PORT);
  return Number.isInteger(puerto) && puerto > 0 ? puerto : PUERTO_POR_DEFECTO;
}

/**
 * ¿El proveedor es Resend? Es HTTP-first: su SMTP desde PaaS sufre timeouts de
 * conexión (el fallo exacto que daba `CONN timeout` en Render) y su API HTTPS
 * es la vía nativa. Se detecta por el host o porque la "contraseña" SMTP es la
 * API key de Resend (formato `re_…`, que es lo que Resend pide como password).
 */
function esResend(): boolean {
  const host = (process.env.SMTP_HOST ?? '').toLowerCase();
  const clave = process.env.SMTP_PASS ?? '';
  return host.includes('resend') || clave.startsWith('re_');
}

/** Envío por la API REST de Resend (HTTPS, sin tocar puertos SMTP). */
async function enviarPorResend(
  destinatario: string,
  asunto: string,
  cuerpo: string,
): Promise<void> {
  const respuesta = await fetch(URL_RESEND, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${process.env.SMTP_PASS}`,
    },
    body: JSON.stringify({
      from: process.env.EMAIL_DESDE || DESDE_POR_DEFECTO,
      to: [destinatario],
      subject: asunto,
      text: cuerpo,
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!respuesta.ok) {
    const texto = (await respuesta.text().catch(() => '')).substring(0, 200);
    throw new Error(`Resend ${respuesta.status}: ${texto}`);
  }
}

/**
 * Envía un email de aviso (Resend por HTTPS o SMTP según la configuración).
 * Nunca lanza: sin configuración se omite con un debug (una sola vez por
 * proceso) y cualquier fallo baja a warn, para que el aviso que ya ha salido
 * por push no se vea afectado.
 */
export async function enviarEmail(
  destinatario: string,
  asunto: string,
  cuerpo: string,
  logger: Logger,
): Promise<void> {
  if (!destinatario) return;

  if (!emailConfigurado()) {
    if (!avisoFaltaConfigurado) {
      avisoFaltaConfigurado = true;
      logger.debug('Email omitido: faltan SMTP_HOST y/o SMTP_PASS en el entorno');
    }
    return;
  }

  if (esResend()) {
    try {
      await enviarPorResend(destinatario, asunto, cuerpo);
      logger.debug({ destinatario, asunto }, 'Email enviado (Resend)');
    } catch (error) {
      logger.warn({ destinatario, asunto, err: error }, 'No se pudo enviar el email (Resend)');
    }
    return;
  }

  const puerto = puertoSmtp();
  const smtps = puerto === PUERTO_SMTPS;
  try {
    const transporte = createTransport({
      host: process.env.SMTP_HOST,
      port: puerto,
      secure: smtps,
      // 465 negocia TLS desde el saludo (smtps); cualquier otro puerto exige STARTTLS
      ...(smtps ? {} : { requireTLS: true }),
      ...(process.env.SMTP_USER
        ? { auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } }
        : {}),
      connectionTimeout: TIMEOUT_MS,
      greetingTimeout: TIMEOUT_MS,
      socketTimeout: TIMEOUT_MS,
    });

    await transporte.sendMail({
      from: process.env.EMAIL_DESDE || DESDE_POR_DEFECTO,
      to: destinatario,
      subject: asunto,
      text: cuerpo,
    });
    logger.debug({ destinatario, asunto }, 'Email enviado');
  } catch (error) {
    logger.warn({ destinatario, asunto, err: error }, 'No se pudo enviar el email');
  }
}
