import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { fechaGtfs } from '@mantirenfe/shared-types';
import { SuprimidosService } from './suprimidos.service';

/**
 * Contrato de `GET /suprimidos`: lista por fecha (hoy por defecto), filtro por
 * estación resolviendo el nombre con `buscarEstaciones` y enriquecimiento con
 * `HorarioTren`/`ParadaHorario`. Mismo patrón de fixtures que `trenes/horarios`.
 */
const { buscarEstacionesMock, cancelacionFindManyMock, horarioFindManyMock, paradaFindManyMock } =
  vi.hoisted(() => ({
    buscarEstacionesMock: vi.fn(),
    cancelacionFindManyMock: vi.fn(),
    horarioFindManyMock: vi.fn(),
    paradaFindManyMock: vi.fn(),
  }));

vi.mock('@mantirenfe/database', () => ({
  getPrisma: () => ({
    cancelacion: { findMany: cancelacionFindManyMock },
    horarioTren: { findMany: horarioFindManyMock },
    paradaHorario: { findMany: paradaFindManyMock },
  }),
  buscarEstaciones: buscarEstacionesMock,
}));

const ATOCHA = { id: '18000', nombre: 'Madrid-Atocha Cercanías' };
const FECHA = '2026-09-28';

function cancelacion(tripId: string, numeroTren: string | null = null) {
  return { tripId, numeroTren, fecha: new Date(`${FECHA}T00:00:00.000Z`) };
}

function horario(tripId: string, numeroTren = '04087') {
  return {
    tripId,
    numeroTren,
    salida: new Date(`${FECHA}T06:55:00.000Z`),
    llegada: new Date(`${FECHA}T09:44:00.000Z`),
    origen: { nombre: 'Madrid-Chamartín-Clara Campoamor' },
    destino: { nombre: 'Gijón' },
  };
}

beforeEach(() => {
  buscarEstacionesMock.mockReset();
  cancelacionFindManyMock.mockReset();
  horarioFindManyMock.mockReset();
  paradaFindManyMock.mockReset();
  buscarEstacionesMock.mockResolvedValue([]);
  horarioFindManyMock.mockResolvedValue([]);
  paradaFindManyMock.mockResolvedValue([]);
});

describe('SuprimidosService.listado', () => {
  it('sin cancelaciones ese día devuelve vacío y no consulta nada más', async () => {
    cancelacionFindManyMock.mockResolvedValue([]);

    const resultado = await new SuprimidosService().listado(FECHA);

    expect(resultado).toEqual([]);
    expect(cancelacionFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { fecha: new Date(`${FECHA}T00:00:00.000Z`) } }),
    );
    expect(horarioFindManyMock).not.toHaveBeenCalled();
    expect(paradaFindManyMock).not.toHaveBeenCalled();
  });

  it('sin fecha consulta el día peninsular actual', async () => {
    cancelacionFindManyMock.mockResolvedValue([]);
    await new SuprimidosService().listado();

    expect(cancelacionFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { fecha: new Date(`${fechaGtfs()}T00:00:00.000Z`) },
      }),
    );
  });

  it('rechaza una fecha con formato distinto a YYYY-MM-DD', async () => {
    await expect(new SuprimidosService().listado('28-09-2026')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(new SuprimidosService().listado('2026-9-28')).rejects.toThrow(
      'Fecha inválida (formato YYYY-MM-DD)',
    );
    expect(cancelacionFindManyMock).not.toHaveBeenCalled();
  });

  it('enriquece con el horario del día (número, extremos y horas)', async () => {
    cancelacionFindManyMock.mockResolvedValue([cancelacion('0408712026-09-28', '04087')]);
    horarioFindManyMock.mockResolvedValue([horario('0408712026-09-28')]);

    const resultado = await new SuprimidosService().listado(FECHA);

    expect(resultado).toEqual([
      {
        tripId: '0408712026-09-28',
        numeroTren: '04087',
        fecha: FECHA,
        origen: 'Madrid-Chamartín-Clara Campoamor',
        destino: 'Gijón',
        salida: '06:55',
        llegada: '09:44',
      },
    ]);
    expect(horarioFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { fecha: new Date(`${FECHA}T00:00:00.000Z`), tripId: { in: ['0408712026-09-28'] } },
      }),
    );
    // Con horario no hace falta mirar las paradas
    expect(paradaFindManyMock).not.toHaveBeenCalled();
  });

  it('estación desconocida: vacío sin cruzar paradas', async () => {
    cancelacionFindManyMock.mockResolvedValue([cancelacion('T1')]);
    buscarEstacionesMock.mockResolvedValue([]);

    const resultado = await new SuprimidosService().listado(FECHA, 'Ciudad que no existe');

    expect(resultado).toEqual([]);
    expect(buscarEstacionesMock).toHaveBeenCalledTimes(1);
    expect(paradaFindManyMock).not.toHaveBeenCalled();
    expect(horarioFindManyMock).not.toHaveBeenCalled();
  });

  it('filtra por estación cruzando solo las paradas de los cancelados del día', async () => {
    cancelacionFindManyMock.mockResolvedValue([
      cancelacion('T-pasa', '11111'),
      cancelacion('T-no-pasa', '22222'),
    ]);
    buscarEstacionesMock.mockResolvedValue([ATOCHA]);
    paradaFindManyMock.mockResolvedValue([{ tripId: 'T-pasa' }, { tripId: 'T-pasa' }]);
    horarioFindManyMock.mockResolvedValue([horario('T-pasa', '11111')]);

    const resultado = await new SuprimidosService().listado(FECHA, 'Atocha');

    expect(buscarEstacionesMock.mock.calls[0]?.slice(1)).toEqual(['Atocha', 1]);
    expect(paradaFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { estacionId: '18000', tripId: { in: ['T-pasa', 'T-no-pasa'] } },
      }),
    );
    expect(resultado.map((f) => f.tripId)).toEqual(['T-pasa']);
    expect(horarioFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ tripId: { in: ['T-pasa'] } }) }),
    );
  });

  it('ningún tren suprimido pasa por la estación: vacío', async () => {
    cancelacionFindManyMock.mockResolvedValue([cancelacion('T1')]);
    buscarEstacionesMock.mockResolvedValue([ATOCHA]);
    paradaFindManyMock.mockResolvedValue([]);

    const resultado = await new SuprimidosService().listado(FECHA, 'Atocha');

    expect(resultado).toEqual([]);
    expect(horarioFindManyMock).not.toHaveBeenCalled();
  });

  it('si el trip no está en HorarioTren, rellena extremos desde ParadaHorario', async () => {
    cancelacionFindManyMock.mockResolvedValue([cancelacion('T-sin-horario')]);
    horarioFindManyMock.mockResolvedValue([]);
    paradaFindManyMock.mockResolvedValue([
      {
        tripId: 'T-sin-horario',
        orden: 5,
        salidaMin: 500,
        llegadaMin: 505,
        estacion: { nombre: 'León' },
      },
      {
        tripId: 'T-sin-horario',
        orden: 1,
        salidaMin: 420,
        llegadaMin: 420,
        estacion: { nombre: 'Hendaya' },
      },
    ]);

    const resultado = await new SuprimidosService().listado(FECHA);

    expect(resultado).toEqual([
      {
        tripId: 'T-sin-horario',
        numeroTren: null,
        fecha: FECHA,
        origen: 'Hendaya',
        destino: 'León',
        salida: '07:00',
        llegada: '08:25',
      },
    ]);
    expect(paradaFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tripId: { in: ['T-sin-horario'] } },
        orderBy: [{ tripId: 'asc' }, { orden: 'asc' }],
      }),
    );
  });
});
