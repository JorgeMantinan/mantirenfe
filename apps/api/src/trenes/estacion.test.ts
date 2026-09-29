import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TrenesService } from './trenes.service';

/**
 * Contrato de `GET /trenes/estacion`: la ficha de salidas de una estación
 * lista todos los trenes que SALEN de ella ese día — aunque la estación no sea
 * el origen del viaje (parada intermedia, cruzada con `ParadaHorario`) — y
 * ninguno en el que no se pueda subir (parada sin `salidaMin`).
 */
const { buscarEstacionesMock, horarioFindManyMock, paradaFindManyMock } = vi.hoisted(() => ({
  buscarEstacionesMock: vi.fn(),
  horarioFindManyMock: vi.fn(),
  paradaFindManyMock: vi.fn(),
}));

vi.mock('@mantirenfe/database', () => ({
  getPrisma: () => ({
    horarioTren: { findMany: horarioFindManyMock },
    paradaHorario: { findMany: paradaFindManyMock },
  }),
  buscarEstaciones: buscarEstacionesMock,
}));

const ARCADE = { id: '23002', nombre: 'Arcade' };
const FECHA = '2026-09-29';
const DIA = new Date(`${FECHA}T00:00:00.000Z`);

interface ViajeTest {
  tripId: string;
  numeroTren: string;
  operador: string | null;
  fecha: Date;
  llegada: Date;
  destino: { nombre: string };
}

interface ParadaTest {
  tripId: string;
  orden: number;
  estacionId: string;
  salidaMin: number | null;
  llegadaMin: number | null;
}

function viaje(
  tripId: string,
  numeroTren: string,
  llegada: string,
  destino = 'Vigo-Guixar',
  operador = 'MD',
  fecha: Date = DIA,
): ViajeTest {
  return {
    tripId,
    numeroTren,
    operador,
    fecha,
    llegada: new Date(llegada),
    destino: { nombre: destino },
  };
}

function parada(
  tripId: string,
  orden: number,
  salidaMin: number | null,
  estacionId = ARCADE.id,
  llegadaMin: number | null = salidaMin,
): ParadaTest {
  return { tripId, orden, estacionId, salidaMin, llegadaMin };
}

/** Doble en memoria: aplica los mismos filtros que Prisma a las paradas. */
function dobleParadas(filas: ParadaTest[]) {
  paradaFindManyMock.mockImplementation(
    async (args: {
      where: { estacionId: string; tripId: { in: string[] }; salidaMin?: { not: null } };
    }) =>
      filas.filter(
        (p) =>
          p.estacionId === args.where.estacionId &&
          args.where.tripId.in.includes(p.tripId) &&
          (args.where.salidaMin ? p.salidaMin !== null : true),
      ),
  );
}

/** Doble en memoria: `HorarioTren` solo devuelve los viajes de la fecha pedida. */
function dobleHorarios(filas: ViajeTest[]) {
  horarioFindManyMock.mockImplementation(async (args: { where: { fecha: Date } }) =>
    filas.filter((h) => h.fecha.getTime() === args.where.fecha.getTime()),
  );
}

beforeEach(() => {
  buscarEstacionesMock.mockReset();
  horarioFindManyMock.mockReset();
  paradaFindManyMock.mockReset();
  buscarEstacionesMock.mockResolvedValue([ARCADE]);
  horarioFindManyMock.mockResolvedValue([]);
  paradaFindManyMock.mockResolvedValue([]);
});

describe('TrenesService.salidasEstacion', () => {
  it('estación desconocida: vacío sin consultar horarios ni paradas', async () => {
    buscarEstacionesMock.mockResolvedValue([]);

    const respuesta = await new TrenesService().salidasEstacion('Ciudad que no existe', FECHA);

    expect(respuesta).toEqual([]);
    expect(horarioFindManyMock).not.toHaveBeenCalled();
    expect(paradaFindManyMock).not.toHaveBeenCalled();
  });

  it('lista los trenes que solo pasan por la estación (parada intermedia)', async () => {
    dobleHorarios([viaje('T-pasa', '09073', `${FECHA}T10:40:00.000Z`)]);
    dobleParadas([parada('T-pasa', 6, 506)]);

    const respuesta = await new TrenesService().salidasEstacion('Arcade', FECHA);

    expect(respuesta).toEqual([
      {
        numeroTren: '09073',
        // El origen mostrado es la estación consultada: la ficha es de sus salidas
        origenNombre: 'Arcade',
        destinoNombre: 'Vigo-Guixar',
        salida: '2026-09-29T08:26:00.000Z',
        // Llegada al destino final del viaje (coherente con destinoNombre)
        llegada: '2026-09-29T10:40:00.000Z',
        duracionMin: 134,
        operador: 'MD',
      },
    ]);
    // Sin filtro por origen: la estación no tiene por qué ser el extremo del viaje
    expect(horarioFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { fecha: DIA } }),
    );
    expect(paradaFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { estacionId: '23002', tripId: { in: ['T-pasa'] }, salidaMin: { not: null } },
      }),
    );
  });

  it('incluye el tren que nace en la estación y ordena por hora de salida', async () => {
    dobleHorarios([
      viaje('T-tarde', '12526', `${FECHA}T16:49:00.000Z`, 'Vigo-Guixar', 'REGIONAL'),
      viaje('T-temprano', '12512', `${FECHA}T09:18:00.000Z`, 'Vigo-Guixar', 'REGIONAL'),
    ]);
    // Devueltas en cualquier orden: la ordenación es por salida de la estación
    dobleParadas([parada('T-tarde', 1, 978), parada('T-temprano', 3, 322)]);

    const respuesta = await new TrenesService().salidasEstacion('Arcade', FECHA);

    expect(respuesta.map((t) => t.numeroTren)).toEqual(['12512', '12526']);
    expect(respuesta.map((t) => t.salida)).toEqual([
      '2026-09-29T05:22:00.000Z',
      '2026-09-29T16:18:00.000Z',
    ]);
  });

  it('excluye los trenes que pasan sin dejar subir (sin salidaMin)', async () => {
    dobleHorarios([viaje('T-sin-salida', '09132', `${FECHA}T17:29:00.000Z`)]);
    dobleParadas([parada('T-sin-salida', 4, null, ARCADE.id, 838)]);

    const respuesta = await new TrenesService().salidasEstacion('Arcade', FECHA);

    expect(respuesta).toEqual([]);
    expect(paradaFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ salidaMin: { not: null } }),
      }),
    );
  });

  it('cruza solo con los viajes que operan ese día (ParadaHorario no tiene fecha)', async () => {
    dobleHorarios([
      viaje('T-hoy', '09073', `${FECHA}T10:40:00.000Z`),
      viaje(
        'T-otro-dia',
        '09075',
        `${FECHA}T11:40:00.000Z`,
        'Vigo-Guixar',
        'MD',
        new Date('2026-09-30T00:00:00.000Z'),
      ),
    ]);
    dobleParadas([parada('T-hoy', 6, 506), parada('T-otro-dia', 6, 560)]);

    const respuesta = await new TrenesService().salidasEstacion('Arcade', FECHA);

    expect(respuesta.map((t) => t.numeroTren)).toEqual(['09073']);
    expect(paradaFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tripId: { in: ['T-hoy'] } }),
      }),
    );
  });

  it('no lista trips sin parada en la estación consultada', async () => {
    dobleHorarios([
      viaje('T-para', '09073', `${FECHA}T10:40:00.000Z`),
      viaje('T-no-para', '09075', `${FECHA}T11:40:00.000Z`),
    ]);
    dobleParadas([
      parada('T-para', 6, 506),
      parada('T-no-para', 6, 560, '17000'),
      parada('T-para', 1, 300, '31412'),
    ]);

    const respuesta = await new TrenesService().salidasEstacion('Arcade', FECHA);

    expect(respuesta.map((t) => t.numeroTren)).toEqual(['09073']);
  });

  it('ordena por salida y corta en 100 salidas', async () => {
    const total = 105;
    dobleHorarios(
      Array.from({ length: total }, (_, i) =>
        viaje(`T${i}`, String(i).padStart(5, '0'), `${FECHA}T23:59:00.000Z`),
      ),
    );
    // Paradas devueltas en orden inverso a la salida
    dobleParadas(Array.from({ length: total }, (_, i) => parada(`T${i}`, 2, 60 + (total - i))));

    const respuesta = await new TrenesService().salidasEstacion('Arcade', FECHA);

    expect(respuesta).toHaveLength(100);
    expect(respuesta[0]?.salida).toBe('2026-09-29T01:01:00.000Z');
    expect(respuesta.at(-1)?.salida).toBe('2026-09-29T02:40:00.000Z');
    const horas = respuesta.map((t) => t.salida);
    expect(horas).toEqual([...horas].sort());
  });

  it('convierte salidas que cruzan la medianoche (salidaMin > 1440)', async () => {
    dobleHorarios([viaje('T-noche', '09412', `${FECHA}T23:59:00.000Z`)]);
    dobleParadas([parada('T-noche', 5, 1500)]);

    const respuesta = await new TrenesService().salidasEstacion('Arcade', FECHA);

    expect(respuesta[0]?.salida).toBe('2026-09-30T01:00:00.000Z');
    expect(respuesta[0]?.duracionMin).toBe(0);
  });
});
