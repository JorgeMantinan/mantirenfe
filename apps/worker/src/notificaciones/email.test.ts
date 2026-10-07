import type { Logger } from 'pino';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { createTransport, sendMail } = vi.hoisted(() => {
  const sendMail = vi.fn(async () => ({ messageId: 'msg-1' }));
  const createTransport = vi.fn((opciones: Record<string, unknown>) => ({ sendMail, opciones }));
  return { createTransport, sendMail };
});

function opcionesTransporte(): Record<string, unknown> {
  return (createTransport.mock.calls[0]?.[0] ?? {}) as Record<string, unknown>;
}

vi.mock('nodemailer', () => ({ createTransport }));

const ENTORNO = { ...process.env };
const CLAVES_SMTP = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'EMAIL_DESDE'] as const;

const logger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
} as unknown as Logger;

/** Módulo fresco: el aviso "solo una vez" del proceso no se arrastra entre tests. */
async function moduloEmail() {
  vi.resetModules();
  return await import('./email');
}

function entorno(pares: Record<string, string | undefined>) {
  for (const clave of CLAVES_SMTP) delete process.env[clave];
  for (const [clave, valor] of Object.entries(pares)) {
    if (valor === undefined) delete process.env[clave];
    else process.env[clave] = valor;
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  entorno({});
});

afterEach(() => {
  for (const clave of CLAVES_SMTP) delete process.env[clave];
  for (const [clave, valor] of Object.entries(ENTORNO)) {
    if (valor === undefined) delete process.env[clave];
    else process.env[clave] = valor;
  }
});

describe('enviarEmail — toma de decisión', () => {
  it('sin SMTP_HOST o SMTP_PASS no intenta enviar y solo avisa una vez', async () => {
    const { enviarEmail } = await moduloEmail();

    await enviarEmail('u@test.es', 'Asunto', 'Cuerpo', logger);
    await enviarEmail('u@test.es', 'Asunto', 'Cuerpo', logger);

    expect(createTransport).not.toHaveBeenCalled();
    expect(sendMail).not.toHaveBeenCalled();
    expect(logger.debug).toHaveBeenCalledTimes(1);
  });

  it('con SMTP configurado crea el transporte y envía el mensaje', async () => {
    const { enviarEmail } = await moduloEmail();
    entorno({ SMTP_HOST: 'smtp.test.es', SMTP_PASS: 'secreto' });

    await enviarEmail('u@test.es', 'Asunto', 'Cuerpo', logger);

    expect(createTransport).toHaveBeenCalledTimes(1);
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'no-reply@mantirenfe.vercel.app',
        to: 'u@test.es',
        subject: 'Asunto',
        text: 'Cuerpo',
      }),
    );
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('sin destinatario no intenta enviar', async () => {
    const { enviarEmail } = await moduloEmail();
    entorno({ SMTP_HOST: 'smtp.test.es', SMTP_PASS: 'secreto' });

    await enviarEmail('', 'Asunto', 'Cuerpo', logger);

    expect(createTransport).not.toHaveBeenCalled();
  });
});

describe('enviarEmail — conexión', () => {
  it('STARTTLS por defecto (puerto 587) y auth solo si hay usuario', async () => {
    const { enviarEmail } = await moduloEmail();
    entorno({ SMTP_HOST: 'smtp.test.es', SMTP_PASS: 'secreto' });

    await enviarEmail('u@test.es', 'Asunto', 'Cuerpo', logger);

    expect(createTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        host: 'smtp.test.es',
        port: 587,
        secure: false,
        requireTLS: true,
        connectionTimeout: 10_000,
      }),
    );
    expect(opcionesTransporte().auth).toBeUndefined();
  });

  it('puerto 465 usa smtps implícito sin exigir STARTTLS', async () => {
    const { enviarEmail } = await moduloEmail();
    entorno({
      SMTP_HOST: 'smtp.test.es',
      SMTP_PORT: '465',
      SMTP_USER: 'remitente',
      SMTP_PASS: 'secreto',
    });

    await enviarEmail('u@test.es', 'Asunto', 'Cuerpo', logger);

    expect(opcionesTransporte()).toEqual(
      expect.objectContaining({
        host: 'smtp.test.es',
        port: 465,
        secure: true,
        auth: { user: 'remitente', pass: 'secreto' },
      }),
    );
    expect('requireTLS' in opcionesTransporte()).toBe(false);
  });

  it('respeta EMAIL_DESDE cuando está definido', async () => {
    const { enviarEmail } = await moduloEmail();
    entorno({
      SMTP_HOST: 'smtp.test.es',
      SMTP_PASS: 'secreto',
      EMAIL_DESDE: 'alertas@ejemplo.com',
    });

    await enviarEmail('u@test.es', 'Asunto', 'Cuerpo', logger);

    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({ from: 'alertas@ejemplo.com' }));
  });

  it('un fallo de envío baja a warn y no lanza', async () => {
    const { enviarEmail } = await moduloEmail();
    entorno({ SMTP_HOST: 'smtp.test.es', SMTP_PASS: 'secreto' });
    sendMail.mockRejectedValueOnce(new Error('connection refused'));

    await expect(enviarEmail('u@test.es', 'Asunto', 'Cuerpo', logger)).resolves.toBeUndefined();
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });
});

describe('enviarEmail — Resend (API HTTPS)', () => {
  const fetchMock = vi.fn(async () => ({ ok: true, status: 200, text: async () => '{}' }));

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('host smtp.resend.com usa la API HTTPS y no nodemailer', async () => {
    const { enviarEmail } = await moduloEmail();
    entorno({ SMTP_HOST: 'smtp.resend.com', SMTP_PASS: 're_clave' });

    await enviarEmail('u@test.es', 'Asunto', 'Cuerpo', logger);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, opciones] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.resend.com/emails');
    expect((opciones.headers as Record<string, string>).authorization).toBe('Bearer re_clave');
    expect(JSON.parse(String(opciones.body))).toEqual({
      from: 'no-reply@mantirenfe.vercel.app',
      to: ['u@test.es'],
      subject: 'Asunto',
      text: 'Cuerpo',
    });
    expect(createTransport).not.toHaveBeenCalled();
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('una API key re_* activa Resend aunque el host no lo diga', async () => {
    const { enviarEmail } = await moduloEmail();
    entorno({ SMTP_HOST: 'smtp.test.es', SMTP_PASS: 're_otraclave' });

    await enviarEmail('u@test.es', 'Asunto', 'Cuerpo', logger);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(createTransport).not.toHaveBeenCalled();
  });

  it('respuesta400 de Resend baja a warn y no lanza', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 422, text: async () => 'from invalido' });
    const { enviarEmail } = await moduloEmail();
    entorno({ SMTP_HOST: 'smtp.resend.com', SMTP_PASS: 're_clave' });

    await expect(enviarEmail('u@test.es', 'Asunto', 'Cuerpo', logger)).resolves.toBeUndefined();
    expect(logger.warn).toHaveBeenCalledTimes(1);
    const contexto = logger.warn.mock.calls[0]?.[0] as { err?: { message?: string } };
    expect(contexto.err?.message).toContain('Resend 422');
  });

  it('con config que no es Resend sigue usando nodemailer', async () => {
    const { enviarEmail } = await moduloEmail();
    entorno({ SMTP_HOST: 'smtp.test.es', SMTP_PASS: 'secreto' });

    await enviarEmail('u@test.es', 'Asunto', 'Cuerpo', logger);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(createTransport).toHaveBeenCalledTimes(1);
  });
});

describe('emailConfigurado', () => {
  it('exige host y contraseña', async () => {
    const { emailConfigurado } = await moduloEmail();

    entorno({});
    expect(emailConfigurado()).toBe(false);
    entorno({ SMTP_HOST: 'smtp.test.es' });
    expect(emailConfigurado()).toBe(false);
    entorno({ SMTP_HOST: 'smtp.test.es', SMTP_PASS: 'secreto' });
    expect(emailConfigurado()).toBe(true);
  });
});
