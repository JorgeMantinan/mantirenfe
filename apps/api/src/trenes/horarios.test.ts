import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TrenesService } from './trenes.service';

/**
 * Contrato de `GET /trenes/horarios`: los campos nuevos son opcionales y
 * permiten a web/móvil distinguir "la estación no existe" de "no hay trenes".
 */
const { buscarEstacionesMock, findManyMock, paradaFindManyMock } = vi.hoisted(() => ({
  buscarEstacionesMock: vi.fn(),
  findManyMock: vi.fn(),
  paradaFindManyMock: vi.fn(),
}));

vi.mock('@mantirenfe/database', () => ({
  getPrisma: () => ({
    horarioTren: { findMany: findManyMock },
    paradaHorario: { findMany: paradaFindManyMock },
  }),
  buscarEstaciones: buscarEstacionesMock,
}));

const POR_ORIGEN = [{ id: '31412', nombre: 'A Coruña' }];
const POR_DESTINO = [{ id: '23008', nombre: 'Vilagarcía de Arousa' }];

function estaciones(resolver: (texto: string) => Array<{ id: string; nombre: string }>) {
  buscarEstacionesMock.mockImplementation(async (_prisma: unknown, texto: string) =>
    resolver(texto),
  );
}

function fila(numeroTren: string) {
  return {
    numeroTren,
    origenEstacionId: '31412',
    destinoEstacionId: '23008',
    salida: new Date('2026-09-28T07:00:00.000Z'),
    llegada: new Date('2026-09-28T07:59:00.000Z'),
    operador: 'MD',
    origen: { nombre: 'A Coruña' },
    destino: { nombre: 'Vilagarcía de Arousa' },
  };
}

beforeEach(() => {
  buscarEstacionesMock.mockReset();
  findManyMock.mockReset();
  paradaFindManyMock.mockReset();
});

describe('TrenesService.horarios (motivo de respuesta vacía)', () => {
  it('estación inexistente: indica cuál falló', async () => {
    estaciones((texto) => (texto.includes('Coruña') ? POR_ORIGEN : []));

    const respuesta = await new TrenesService().horarios({
      origen: 'A Coruña',
      destino: 'Vilagarcía de Arousa',
      fecha: '2026-09-28',
    });

    expect(respuesta).toEqual({
      fuente: 'cache',
      trenes: [],
      estacionesEncontradas: false,
      motivo: 'estaciones',
      estacionesNoEncontradas: ['Vilagarcía de Arousa'],
    });
    expect(findManyMock).not.toHaveBeenCalled();
  });

  it('ambas estaciones existen pero no hay trenes: motivo sin-trenes', async () => {
    estaciones((texto) => (texto.includes('Coruña') ? POR_ORIGEN : POR_DESTINO));
    findManyMock.mockResolvedValue([]);

    const respuesta = await new TrenesService().horarios({
      origen: 'A Coruña',
      destino: 'Vilagarcía de Arousa',
      fecha: '2026-09-28',
    });

    expect(respuesta.estacionesEncontradas).toBe(true);
    expect(respuesta.motivo).toBe('sin-trenes');
    expect(respuesta.trenes).toEqual([]);
    expect(respuesta.estacionesNoEncontradas).toBeUndefined();
  });

  it('con trenes no se envía motivo (compatibilidad con clientes antiguos)', async () => {
    estaciones((texto) => (texto.includes('Coruña') ? POR_ORIGEN : POR_DESTINO));
    // directos, salientes y entrantes
    findManyMock
      .mockResolvedValueOnce([fila('09073')])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const respuesta = await new TrenesService().horarios({
      origen: 'A Coruña',
      destino: 'Vilagarcía de Arousa',
      fecha: '2026-09-28',
    });

    expect(respuesta.trenes).toHaveLength(1);
    expect(respuesta.trenes[0]?.numeroTren).toBe('09073');
    expect(respuesta.estacionesEncontradas).toBe(true);
    expect(respuesta.motivo).toBeUndefined();
  });

  it('sin directos ni transbordo, recompone el trayecto por paradas intermedias', async () => {
    estaciones((texto) => (texto.includes('Coruña') ? POR_ORIGEN : POR_DESTINO));
    findManyMock
      .mockResolvedValueOnce([]) // directos (extremos)
      .mockResolvedValueOnce([]) // salientes del transbordo
      .mockResolvedValueOnce([]) // entrantes del transbordo
      // viajes que operan ese día (HorarioTren con tripId)
      .mockResolvedValueOnce([{ tripId: 'T1', numeroTren: '09073', operador: 'MD' }]);
    paradaFindManyMock
      .mockResolvedValueOnce([
        { tripId: 'T1', estacionId: '31412', orden: 1, salidaMin: 420, llegadaMin: 420 },
      ])
      .mockResolvedValueOnce([
        { tripId: 'T1', estacionId: '23008', orden: 4, salidaMin: 479, llegadaMin: 479 },
      ]);

    const respuesta = await new TrenesService().horarios({
      origen: 'A Coruña',
      destino: 'Vilagarcía de Arousa',
      fecha: '2026-09-28',
    });

    expect(respuesta.trenes).toEqual([
      {
        numeroTren: '09073',
        origenNombre: 'A Coruña',
        destinoNombre: 'Vilagarcía de Arousa',
        salida: '2026-09-28T07:00:00.000Z',
        llegada: '2026-09-28T07:59:00.000Z',
        duracionMin: 59,
        operador: 'MD',
      },
    ]);
    expect(respuesta.motivo).toBeUndefined();
  });

  it('si el cruce por paradas falla (tabla sin migrar), sigue respondiendo sin-trenes', async () => {
    estaciones((texto) => (texto.includes('Coruña') ? POR_ORIGEN : POR_DESTINO));
    findManyMock.mockResolvedValue([]);
    paradaFindManyMock.mockRejectedValue(new Error('tabla ParadaHorario no existe'));

    const respuesta = await new TrenesService().horarios({
      origen: 'A Coruña',
      destino: 'Vilagarcía de Arousa',
      fecha: '2026-09-28',
    });

    expect(respuesta.trenes).toEqual([]);
    expect(respuesta.estacionesEncontradas).toBe(true);
    expect(respuesta.motivo).toBe('sin-trenes');
  });
});
