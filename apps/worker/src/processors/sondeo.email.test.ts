import type { Logger } from 'pino';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { notificar } from './sondeo';

const { createTransport, sendMail, enviarPush, enviarPushMovil, creadas } = vi.hoisted(() => {
  const sendMail = vi.fn(async () => ({ messageId: 'msg-1' }));
  const createTransport = vi.fn(() => ({ sendMail }));
  return {
    createTransport,
    sendMail,
    enviarPush: vi.fn(async () => undefined),
    enviarPushMovil: vi.fn(async () => undefined),
    creadas: [] as Array<Record<string, unknown>>,
  };
});

vi.mock('nodemailer', () => ({ createTransport }));
vi.mock('../notificaciones/web-push', () => ({ enviarPush }));
vi.mock('../notificaciones/expo-push', () => ({ enviarPushMovil }));
vi.mock('@mantirenfe/database', () => ({
  getPrisma: () => ({
    notificacion: {
      create: async (args: { data: Record<string, unknown> }) => {
        creadas.push(args.data);
        return args.data;
      },
    },
  }),
  buscarEstaciones: async () => [],
  normalizarTexto: (texto: string) => texto,
}));

const CLAVES_SMTP = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'EMAIL_DESDE'] as const;
const ENTORNO = { ...process.env };

const logger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
} as unknown as Logger;

const suscripcion = { endpoint: 'https://push.test', p256dh: 'p', auth: 'a' };
const token = { id: 't1', token: 'ExponentPushToken[x]' };

function alerta(preferencias: unknown, email: string | null = 'u@test.es') {
  return {
    id: 'a1',
    usuarioId: 'u1',
    origenNombre: 'Madrid',
    destinoNombre: 'Sevilla',
    fechaViaje: new Date('2026-10-01T00:00:00.000Z'),
    criterio: 'DISPONIBILIDAD',
    usuario: { email, preferencias, suscripciones: [suscripcion], tokensMovil: [token] },
  };
}

async function notificarAlerta(al: ReturnType<typeof alerta>, conEmail: boolean) {
  await notificar(
    al,
    '¡Plaza disponible!',
    'Queda disponibilidad en Madrid → Sevilla el 2026-10-01.',
    { trenes: ['t1'] },
    logger,
    conEmail ? { email: true } : undefined,
  );
  // el email se dispara sin esperar: cede el turno para que llegue a enviarMail
  await Promise.resolve();
}

beforeEach(() => {
  vi.clearAllMocks();
  creadas.length = 0;
  for (const clave of CLAVES_SMTP) delete process.env[clave];
});

afterEach(() => {
  for (const clave of CLAVES_SMTP) delete process.env[clave];
  for (const [clave, valor] of Object.entries(ENTORNO)) {
    if (valor === undefined) delete process.env[clave];
    else process.env[clave] = valor;
  }
});

describe('notificar — decisión de envío de email', () => {
  it('con notificacionesEmail y SMTP configurado envía el email además de los push', async () => {
    process.env.SMTP_HOST = 'smtp.test.es';
    process.env.SMTP_PASS = 'secreto';

    await notificarAlerta(alerta({ notificacionesEmail: true }), true);

    expect(createTransport).toHaveBeenCalledTimes(1);
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'u@test.es',
        subject: '¡Plaza disponible!',
        text: 'Queda disponibilidad en Madrid → Sevilla el 2026-10-01.',
      }),
    );
    expect(enviarPush).toHaveBeenCalledTimes(1);
    expect(enviarPushMovil).toHaveBeenCalledTimes(1);
    expect(creadas).toHaveLength(1);
  });

  it('no envía email si el usuario no activó notificacionesEmail', async () => {
    process.env.SMTP_HOST = 'smtp.test.es';
    process.env.SMTP_PASS = 'secreto';

    await notificarAlerta(alerta({}), true);

    expect(sendMail).not.toHaveBeenCalled();
    expect(enviarPush).toHaveBeenCalledTimes(1);
    expect(creadas).toHaveLength(1);
  });

  it('no envía email con el "{}" por defecto del esquema', async () => {
    process.env.SMTP_HOST = 'smtp.test.es';
    process.env.SMTP_PASS = 'secreto';

    await notificarAlerta(alerta('{}'), true);

    expect(sendMail).not.toHaveBeenCalled();
  });

  it('sin SMTP configurado no intenta enviar y no rompe la notificación', async () => {
    await notificarAlerta(alerta({ notificacionesEmail: true }), true);

    expect(createTransport).not.toHaveBeenCalled();
    expect(sendMail).not.toHaveBeenCalled();
    expect(enviarPush).toHaveBeenCalledTimes(1);
    expect(creadas).toHaveLength(1);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('no envía email si el usuario no tiene dirección', async () => {
    process.env.SMTP_HOST = 'smtp.test.es';
    process.env.SMTP_PASS = 'secreto';

    await notificarAlerta(alerta({ notificacionesEmail: true }, null), true);

    expect(sendMail).not.toHaveBeenCalled();
  });

  it('las rutas que no lo piden (recordatorios, resúmenes, incidencias) no envían email', async () => {
    process.env.SMTP_HOST = 'smtp.test.es';
    process.env.SMTP_PASS = 'secreto';

    await notificarAlerta(alerta({ notificacionesEmail: true }), false);

    expect(sendMail).not.toHaveBeenCalled();
    expect(enviarPush).toHaveBeenCalledTimes(1);
    expect(creadas).toHaveLength(1);
  });

  it('notificacionesPush false corta los push pero el email sigue', async () => {
    process.env.SMTP_HOST = 'smtp.test.es';
    process.env.SMTP_PASS = 'secreto';

    await notificarAlerta(alerta({ notificacionesPush: false, notificacionesEmail: true }), true);

    expect(enviarPush).not.toHaveBeenCalled();
    expect(enviarPushMovil).not.toHaveBeenCalled();
    expect(sendMail).toHaveBeenCalledTimes(1);
  });
});
