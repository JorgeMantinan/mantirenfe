import type { Logger } from 'pino';
import { describe, expect, it, vi } from 'vitest';
import type { getPrisma } from '@mantirenfe/database';
import { esPendienteDeSondeo, resetearRecurrentes } from './barrido';

// 2026-10-04 es domingo: 05 lunes, 06 martes, 07 miércoles, 09 viernes, 10 sábado
const MARTES = new Date('2026-10-06T12:00:00.000Z');
const SABADO = new Date('2026-10-10T12:00:00.000Z');
const AHORA_MS = MARTES.getTime();

const logger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
} as unknown as Logger;

type PrismaFalso = ReturnType<typeof getPrisma>;

describe('esPendienteDeSondeo', () => {
  it('una recurrente con días marcados entra en pendientes un martes', () => {
    // dom+vie marcados: el martes NO le toca, pero evalúa el viernes próximo
    expect(
      esPendienteDeSondeo(
        {
          recurrente: true,
          diasSemana: [0, 5],
          ultimoSondeoEn: new Date('2026-10-06T08:00:00.000Z'),
          intervaloSondeoMin: 10,
        },
        MARTES,
        AHORA_MS,
      ),
    ).toBe(true);

    // Y también sin sondeo previo (recién creada) y en otros días no marcados
    expect(
      esPendienteDeSondeo({ recurrente: true, diasSemana: [0, 5], intervaloSondeoMin: 10 }, SABADO),
    ).toBe(true);
  });

  it('la frecuencia la sigue marcando intervaloSondeoMin', () => {
    const alerta = {
      recurrente: true,
      diasSemana: [0, 5],
      intervaloSondeoMin: 10,
    };
    expect(
      esPendienteDeSondeo(
        { ...alerta, ultimoSondeoEn: new Date(AHORA_MS - 2 * 60_000) },
        MARTES,
        AHORA_MS,
      ),
    ).toBe(false);
    expect(
      esPendienteDeSondeo(
        { ...alerta, ultimoSondeoEn: new Date(AHORA_MS - 10 * 60_000) },
        MARTES,
        AHORA_MS,
      ),
    ).toBe(true);
    // Sin intervalo en la fila se aplica el mismo default que el claim (10 min)
    expect(
      esPendienteDeSondeo(
        { recurrente: true, diasSemana: [0, 5], ultimoSondeoEn: new Date(AHORA_MS - 60_000) },
        MARTES,
        AHORA_MS,
      ),
    ).toBe(false);
  });

  it('el resto sigue el filtro de día de siempre (esDiaAplicable)', () => {
    // Legada soloLaborables con diasSemana vacío: en sábado no toca
    expect(
      esPendienteDeSondeo(
        {
          recurrente: true,
          diasSemana: [],
          soloLaborables: true,
          intervaloSondeoMin: 10,
          ultimoSondeoEn: null,
        },
        SABADO,
      ),
    ).toBe(false);
    // Mismo día para una no recurrente: va por su fecha de viaje, siempre cuenta
    expect(
      esPendienteDeSondeo(
        { recurrente: false, diasSemana: [], soloLaborables: true, ultimoSondeoEn: null },
        SABADO,
      ),
    ).toBe(true);
  });
});

describe('resetearRecurrentes', () => {
  it('limpia los avisos del día pero conserva ultimoEstado (mismo objetivo, sin re-aviso)', async () => {
    type LlamadaUpdateMany = { where: Record<string, unknown>; data: Record<string, unknown> };
    const updateMany = vi.fn(async (_llamada: LlamadaUpdateMany) => ({ count: 3 }));
    const prisma = { alerta: { updateMany } } as unknown as PrismaFalso;

    const contadas = await resetearRecurrentes(prisma, new Date('2026-10-06T00:00:00Z'), logger);

    expect(contadas).toBe(3);
    expect(updateMany).toHaveBeenCalledTimes(1);
    const llamada = updateMany.mock.calls[0]![0];

    // Solo se reinician las recurrentes activas cuyo último sondeo fue ayer
    expect(llamada.where).toMatchObject({ recurrente: true, estado: 'ACTIVA' });

    // Lo del día de viaje vuelve a cero para poder enviarse hoy
    expect(llamada.data).toMatchObject({
      ultimoSondeoEn: null,
      recordatorioTrenesEnviados: [],
      recordatorioEnviadoEn: null,
      resumenEnviadoEn: null,
    });

    // Y el estado del sondeo NO se borra: con la fecha objetivo estable (vie →
    // vie) el estado sigue siendo el del mismo viernes, así que el próximo
    // sondeo compara contra él y no re-avisa del hallazgo de siempre
    expect(llamada.data).not.toHaveProperty('ultimoEstado');
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('un fallo de BD no rompe el barrido: se loguea y se reintenta en el próximo', async () => {
    const prisma = {
      alerta: {
        updateMany: vi.fn(async () => {
          throw new Error('sin conexión');
        }),
      },
    } as unknown as PrismaFalso;

    const contadas = await resetearRecurrentes(prisma, new Date('2026-10-06T00:00:00Z'), logger);

    expect(contadas).toBe(0);
    expect(logger.error).toHaveBeenCalled();
  });
});
