import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Logger } from 'pino';
import { hoyGtfs } from './reloj';
import { limitePoda, persistirSuprimidos, planearCancelaciones } from './suprimidos';

const { getPrismaMock } = vi.hoisted(() => ({ getPrismaMock: vi.fn() }));

vi.mock('@mantirenfe/database', () => ({ getPrisma: () => getPrismaMock() }));

const URLS = 'https://feed-a.test/trip_updates.json,https://feed-b.test/trip_updates_LD.json';

function loggerFalso() {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as unknown as Logger;
}

function prismaFalso() {
  return {
    horarioTren: { findMany: vi.fn().mockResolvedValue([]) },
    cancelacion: {
      upsert: vi.fn().mockResolvedValue({}),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
  };
}

const FECHA = '2026-09-28';

describe('planearCancelaciones', () => {
  it('genera una fila por trip con su fecha y número de tren', () => {
    const filas = planearCancelaciones(
      new Set(['T2', 'T1']),
      new Map([
        ['T1', '04087'],
        ['T2', null],
      ]),
      FECHA,
    );

    expect(filas).toEqual([
      { tripId: 'T1', fecha: new Date('2026-09-28T00:00:00.000Z'), numeroTren: '04087' },
      { tripId: 'T2', fecha: new Date('2026-09-28T00:00:00.000Z'), numeroTren: null },
    ]);
  });

  it('sin horario para el trip, el número queda a null', () => {
    const [fila] = planearCancelaciones(new Set(['desconocido']), new Map(), FECHA);
    expect(fila?.numeroTren).toBeNull();
  });
});

describe('limitePoda', () => {
  it('poda lo anterior a hoy menos 7 días', () => {
    expect(limitePoda('2026-09-28')).toEqual(new Date('2026-09-21T00:00:00.000Z'));
    // Cruce de mes: el cálculo es sobre el día del mes en UTC
    expect(limitePoda('2026-09-03')).toEqual(new Date('2026-08-27T00:00:00.000Z'));
    expect(limitePoda('2026-01-01')).toEqual(new Date('2025-12-25T00:00:00.000Z'));
  });

  it('rechaza una fecha que no sea YYYY-MM-DD', () => {
    expect(() => limitePoda('28-09-2026')).toThrow('FECHA_INVALIDA_28-09-2026');
  });
});

describe('persistirSuprimidos', () => {
  let prisma: ReturnType<typeof prismaFalso>;
  let fetchMock: ReturnType<typeof vi.fn>;
  let logger: Logger;
  let fechaOriginal: string | undefined;

  beforeEach(() => {
    prisma = prismaFalso();
    getPrismaMock.mockReturnValue(prisma);
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    logger = loggerFalso();
    fechaOriginal = process.env.GTFS_RT_TRIP_UPDATES_URL;
    process.env.GTFS_RT_TRIP_UPDATES_URL = URLS;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (fechaOriginal === undefined) delete process.env.GTFS_RT_TRIP_UPDATES_URL;
    else process.env.GTFS_RT_TRIP_UPDATES_URL = fechaOriginal;
  });

  function feed(canceldos: string[]) {
    return {
      entity: canceldos.map((tripId) => ({
        tripUpdate: { trip: { tripId, scheduleRelationship: 'CANCELED' } },
      })),
    };
  }

  it('guarda los trips cancelados del día y poda lo antiguo', async () => {
    prisma.horarioTren.findMany.mockResolvedValue([
      { tripId: '0408712026-09-28', numeroTren: '04087' },
      { tripId: null, numeroTren: 'hueco' },
    ]);
    fetchMock.mockImplementation(async (url: string) => ({
      ok: true,
      json: async () =>
        url.includes('feed-a')
          ? feed(['0408712026-09-28', '1309512026-09-23'])
          : feed(['0408712026-09-28']),
    }));
    prisma.cancelacion.deleteMany.mockResolvedValue({ count: 3 });

    await persistirSuprimidos(logger);

    // Solo el trip que opera hoy según el horario (el desconocido se descarta)
    expect(prisma.cancelacion.upsert).toHaveBeenCalledTimes(1);
    expect(prisma.cancelacion.upsert).toHaveBeenCalledWith({
      where: {
        tripId_fecha: { tripId: '0408712026-09-28', fecha: new Date(`${hoyGtfs()}T00:00:00.000Z`) },
      },
      update: { numeroTren: '04087' },
      create: {
        tripId: '0408712026-09-28',
        fecha: new Date(`${hoyGtfs()}T00:00:00.000Z`),
        numeroTren: '04087',
      },
    });
    expect(prisma.cancelacion.deleteMany).toHaveBeenCalledWith({
      where: { fecha: { lt: limitePoda(hoyGtfs()) } },
    });
    expect(logger.info).toHaveBeenCalled();
  });

  it('no reescribe detectadaEn ni el número si la fila ya existe sin número', async () => {
    prisma.horarioTren.findMany.mockResolvedValue([{ tripId: '3069L23557C1', numeroTren: null }]);
    fetchMock.mockResolvedValue({ ok: true, json: async () => feed(['3069L23557C1']) });

    await persistirSuprimidos(logger);

    expect(prisma.cancelacion.upsert).toHaveBeenCalledWith({
      where: {
        tripId_fecha: { tripId: '3069L23557C1', fecha: new Date(`${hoyGtfs()}T00:00:00.000Z`) },
      },
      update: {},
      create: {
        tripId: '3069L23557C1',
        fecha: new Date(`${hoyGtfs()}T00:00:00.000Z`),
        numeroTren: null,
      },
    });
  });

  it('si falla un feed, sigue con el otro y lo registra en el log', async () => {
    prisma.horarioTren.findMany.mockResolvedValue([{ tripId: 'T1', numeroTren: '11111' }]);
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('feed-a')) throw new Error('red caída');
      return { ok: true, json: async () => feed(['T1']) };
    });

    await persistirSuprimidos(logger);

    expect(prisma.cancelacion.upsert).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalled();
  });

  it('sin horario del día no descarga nada ni poda', async () => {
    prisma.horarioTren.findMany.mockResolvedValue([]);

    await persistirSuprimidos(logger);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(prisma.cancelacion.upsert).not.toHaveBeenCalled();
    expect(prisma.cancelacion.deleteMany).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalled();
  });

  it('si ningún feed responde, conserva el histórico y no poda', async () => {
    prisma.horarioTren.findMany.mockResolvedValue([{ tripId: 'T1', numeroTren: '11111' }]);
    fetchMock.mockRejectedValue(new Error('503'));

    await persistirSuprimidos(logger);

    expect(prisma.cancelacion.upsert).not.toHaveBeenCalled();
    expect(prisma.cancelacion.deleteMany).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalled();
  });
});
