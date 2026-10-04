import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PosicionTrenResponse } from '@mantirenfe/shared-types';
import { TrenesService } from './trenes.service';

/**
 * Sanidad de la MUESTRA al escribir en `ImpuntualidadTren` (`persistirPosiciones`).
 *
 * El feed GTFS-RT emite delay que no son retrasos de viajeros: viajes de
 * plataforma (`numeroTren` con `PLATF`, p. ej. `C4a-27318-PLATF.(0)`) y
 * cruces de medianoche de ~24 h. En septiembre llegaron al ranking como
 * 1.426 min (23,7 h) y 1.074 min, es decir +1000 min imposibles.
 */
const mocks = vi.hoisted(() => ({
  posicionCreateMany: vi.fn(),
  posicionDeleteMany: vi.fn(),
  historialCreateMany: vi.fn(),
  historialDeleteMany: vi.fn(),
  impuntualidadFindMany: vi.fn(),
  impuntualidadCreateMany: vi.fn(),
  impuntualidadUpdateMany: vi.fn(),
}));

vi.mock('@mantirenfe/database', () => {
  const prisma = {
    posicionTren: {
      createMany: mocks.posicionCreateMany,
      deleteMany: mocks.posicionDeleteMany,
    },
    posicionHistorial: {
      createMany: mocks.historialCreateMany,
      deleteMany: mocks.historialDeleteMany,
    },
    impuntualidadTren: {
      findMany: mocks.impuntualidadFindMany,
      createMany: mocks.impuntualidadCreateMany,
      updateMany: mocks.impuntualidadUpdateMany,
    },
    // La transacción se ejecuta en secuencia (sin rollback real en el test)
    $transaction: (fn: (tx: unknown) => unknown) => fn(prisma),
  };
  return { getPrisma: () => prisma, buscarEstaciones: vi.fn() };
});

const posicion = (sobrantes: Partial<PosicionTrenResponse>): PosicionTrenResponse => ({
  id: 'p1',
  numeroTren: '04193',
  latitud: 40.4,
  longitud: -3.7,
  velocidadKmh: 120,
  retrasoSeg: 600,
  actualizadaEn: '2026-09-25T12:00:00.000Z',
  tripId: '041932026-09-25',
  ...sobrantes,
});

type Persistir = (datos: PosicionTrenResponse[]) => Promise<void>;

function persistir(datos: PosicionTrenResponse[]): Promise<void> {
  const servicio = new TrenesService() as unknown as { persistirPosiciones: Persistir };
  return servicio.persistirPosiciones(datos);
}

/** tripIds que acabaron insertados en `ImpuntualidadTren` (una sola escritura en lote). */
function registrados(): string[] {
  const llamada = mocks.impuntualidadCreateMany.mock.calls[0]?.[0] as
    { data: Array<{ tripId: string }> } | undefined;
  return (llamada?.data ?? []).map((fila) => fila.tripId);
}

/** `retrasoMaxSeg` de cada fila insertada en `ImpuntualidadTren`, en orden. */
function retrasosInsertados(): number[] {
  const llamada = mocks.impuntualidadCreateMany.mock.calls[0]?.[0] as
    { data: Array<{ retrasoMaxSeg: number }> } | undefined;
  return (llamada?.data ?? []).map((fila) => fila.retrasoMaxSeg);
}

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.impuntualidadFindMany.mockResolvedValue([]);
  mocks.impuntualidadCreateMany.mockResolvedValue({ count: 1 });
  mocks.impuntualidadUpdateMany.mockResolvedValue({ count: 1 });
  mocks.posicionCreateMany.mockResolvedValue({ count: 0 });
  mocks.posicionDeleteMany.mockResolvedValue({ count: 0 });
  mocks.historialCreateMany.mockResolvedValue({ count: 0 });
  mocks.historialDeleteMany.mockResolvedValue({ count: 0 });
});

describe('TrenesService.persistirPosiciones (sanidad de ImpuntualidadTren)', () => {
  it('registra un retraso normal (600 s) y descarta los artefactos de >6 h', async () => {
    await persistir([
      posicion({ id: 'ok', tripId: 'T-OK', numeroTren: '04193', retrasoSeg: 600 }),
      // Cruce de medianoche: 1.426 min medidos en C4a-27318-PLATF.(0)
      posicion({ id: 'madrugada', tripId: 'T-CRUCE', numeroTren: 'C4a-27318', retrasoSeg: 85_560 }),
      // Techo exacto (6 h): se queda, el descarte es SOLO por encima
      posicion({ id: 'borde', tripId: 'T-BORDE', numeroTren: '09073', retrasoSeg: 21_600 }),
    ]);

    expect(registrados().sort()).toEqual(['T-BORDE', 'T-OK']);
    expect(retrasosInsertados()).toEqual([600, 21_600]);
  });

  it('descarta los viajes de plataforma (PLATF) aunque su retraso sea modesto', async () => {
    await persistir([
      posicion({
        id: 'plataforma',
        tripId: 'T-PLATF',
        numeroTren: 'C4a-27318-PLATF.(0)',
        retrasoSeg: 600,
      }),
      posicion({ id: 'viajero', tripId: 'T-VIAJERO', numeroTren: 'C4a-27318', retrasoSeg: 600 }),
      posicion({
        id: 'mantenimiento',
        tripId: 'T-PLATF-2',
        numeroTren: 'C7-70500-PLATF.(2)',
        retrasoSeg: 1_000,
      }),
    ]);

    expect(registrados()).toEqual(['T-VIAJERO']);
  });

  it('mantiene el umbral de 300 s: por debajo no se registra nada', async () => {
    await persistir([
      posicion({ id: 'casi', tripId: 'T-CASI', retrasoSeg: 299 }),
      posicion({ id: 'sin-trip', tripId: null, retrasoSeg: 900 }),
      posicion({ id: 'sin-retraso', tripId: 'T-SIN', retrasoSeg: null }),
      posicion({ id: 'vale', tripId: 'T-VALE', retrasoSeg: 300 }),
    ]);

    expect(registrados()).toEqual(['T-VALE']);
  });

  it('la sanidad solo afecta a ImpuntualidadTren: posiciones e historial se guardan enteros', async () => {
    const datos = [
      posicion({ id: 'ok', tripId: 'T-OK', retrasoSeg: 600 }),
      posicion({ id: 'absurdo', tripId: 'T-CRUCE', numeroTren: 'C4a-27318', retrasoSeg: 85_560 }),
      posicion({
        id: 'plataforma',
        tripId: 'T-PLATF',
        numeroTren: 'C4a-27318-PLATF.(0)',
        retrasoSeg: 600,
      }),
    ];

    await persistir(datos);

    // Un snapshot = UNA escritura de posiciones (antes: un upsert por tren)
    expect(mocks.posicionCreateMany).toHaveBeenCalledTimes(1);
    expect((mocks.posicionCreateMany.mock.calls[0]?.[0] as { data: unknown[] }).data).toHaveLength(
      3,
    );
    expect(mocks.historialCreateMany).toHaveBeenCalledTimes(1);
    expect((mocks.historialCreateMany.mock.calls[0]?.[0] as { data: unknown[] }).data).toHaveLength(
      3,
    );
    // Una para refrescar el snapshot (borrar+insertar en transacción) y otra
    // para la poda de posiciones con más de 24 h sin verse
    expect(mocks.posicionDeleteMany).toHaveBeenCalledTimes(2);
    expect(mocks.historialDeleteMany).toHaveBeenCalledTimes(1);
  });

  it('si el día ya tiene el trip, solo sube el retraso máximo por encima del previo', async () => {
    mocks.impuntualidadFindMany.mockResolvedValue([
      { tripId: 'T-OK', retrasoMaxSeg: 900 },
      { tripId: 'T-PEOR', retrasoMaxSeg: 500 },
    ]);

    await persistir([
      posicion({ id: 'a', tripId: 'T-OK', retrasoSeg: 600 }),
      posicion({ id: 'b', tripId: 'T-PEOR', retrasoSeg: 1_200 }),
    ]);

    expect(mocks.impuntualidadCreateMany).not.toHaveBeenCalled();
    expect(mocks.impuntualidadUpdateMany).toHaveBeenCalledTimes(1);
    expect(mocks.impuntualidadUpdateMany.mock.calls[0]?.[0]).toEqual({
      where: { fecha: expect.any(Date), tripId: { in: ['T-PEOR'] } },
      data: { retrasoMaxSeg: 1_200 },
    });
  });
});
