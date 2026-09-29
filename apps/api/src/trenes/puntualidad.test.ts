import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TrenesService } from './trenes.service';
import type { FilaParada, ServicioImpuntual } from './puntualidad';

/**
 * Contrato de `GET /trenes/puntualidad`: el ranking agrupa por **eje del
 * servicio** (origen→destino del trip, resueltos con `ParadaHorario`), no por
 * vehículo físico — un mismo tren haciendo dos rutas no debe sumar sus
 * servicios en una sola fila.
 */
const mocks = vi.hoisted(() => ({
  impuntualidadFindMany: vi.fn(),
  paradaFindMany: vi.fn(),
  estacionFindMany: vi.fn(),
  horarioFindMany: vi.fn(),
}));

vi.mock('@mantirenfe/database', () => ({
  getPrisma: () => ({
    impuntualidadTren: { findMany: mocks.impuntualidadFindMany },
    paradaHorario: { findMany: mocks.paradaFindMany },
    estacion: { findMany: mocks.estacionFindMany },
    horarioTren: { findMany: mocks.horarioFindMany },
  }),
  buscarEstaciones: vi.fn(),
}));

const MES = '2026-09';
const DESDE = new Date('2026-09-01T00:00:00.000Z');
const HASTA = new Date('2026-10-01T00:00:00.000Z');

const MADRID = { id: '35000', nombre: 'Madrid-Atocha' };
const SEVILLA = { id: '41000', nombre: 'Sevilla-Santa Justa' };
const BARCELONA = { id: '46000', nombre: 'Barcelona-Sants' };
const ZARAGOZA = { id: '71000', nombre: 'Zaragoza-Delicias' };
const CORDOBA = { id: '48000', nombre: 'Córdoba' };

const dia = (n: number) => new Date(Date.UTC(2026, 8, n));
const hora = (n: number) => new Date(Date.UTC(2026, 8, 1, 0, n, 0));

/** T1/T2: Madrid → Sevilla (parada intermedia en Córdoba). T3: Madrid → Barcelona. */
const PARADAS: FilaParada[] = [
  { tripId: 'T1', orden: 1, estacionId: MADRID.id, salidaMin: 7 * 60, llegadaMin: 7 * 60 },
  { tripId: 'T1', orden: 2, estacionId: CORDOBA.id, salidaMin: 8 * 60 + 20, llegadaMin: 502 },
  { tripId: 'T1', orden: 3, estacionId: SEVILLA.id, salidaMin: 599, llegadaMin: 599 },
  { tripId: 'T2', orden: 1, estacionId: MADRID.id, salidaMin: 8 * 60, llegadaMin: 8 * 60 },
  { tripId: 'T2', orden: 3, estacionId: SEVILLA.id, salidaMin: 659, llegadaMin: 659 },
  { tripId: 'T3', orden: 1, estacionId: MADRID.id, salidaMin: 7 * 60 + 30, llegadaMin: 450 },
  { tripId: 'T3', orden: 2, estacionId: BARCELONA.id, salidaMin: 720, llegadaMin: 720 },
];

/** El mismo vehículo (V1) hace dos rutas distintas en el mes. */
const SERVICIOS: ServicioImpuntual[] = [
  { tripId: 'T1', vehiculoId: 'V1', numeroTren: '09073', fecha: dia(1), retrasoMaxSeg: 600 },
  { tripId: 'T2', vehiculoId: 'V1', numeroTren: '09074', fecha: dia(2), retrasoMaxSeg: 900 },
  { tripId: 'T1', vehiculoId: 'V1', numeroTren: '09073', fecha: dia(6), retrasoMaxSeg: 600 },
  { tripId: 'T3', vehiculoId: 'V1', numeroTren: '04193', fecha: dia(3), retrasoMaxSeg: 300 },
];

interface HorarioDia {
  numeroTren: string;
  fecha: Date;
  salida: Date;
  llegada: Date;
  origen: string;
  destino: string;
}

interface Base {
  servicios: ServicioImpuntual[];
  paradas: FilaParada[];
  estaciones: Array<{ id: string; nombre: string }>;
  horarios: HorarioDia[];
}

const BASE_VACIA: Base = { servicios: [], paradas: [], estaciones: [], horarios: [] };

interface Consultas {
  servicios: number;
  paradas: number;
  estaciones: number;
  horarios: number;
  tripsPedidos: string[];
  estacionesPedidas: string[];
  numerosPedidos: string[];
  rango: { desde: Date; hasta: Date } | null;
}

/**
 * Doble en memoria que aplica los mismos filtros que Prisma (fecha ∈,
 * tripId ∈, id ∈, numeroTren ∈) para que los tests verifiquen también QUÉ
 * ids manda cada query: si se hiciera N+1, `paradas`/`estaciones` saltarían.
 */
function instalar(base: Partial<Base>): Consultas {
  const datos: Base = { ...BASE_VACIA, ...base };
  const consultas: Consultas = {
    servicios: 0,
    paradas: 0,
    estaciones: 0,
    horarios: 0,
    tripsPedidos: [],
    estacionesPedidas: [],
    numerosPedidos: [],
    rango: null,
  };

  mocks.impuntualidadFindMany.mockImplementation(
    async (args: { where: { fecha: { gte: Date; lt: Date } } }) => {
      consultas.servicios += 1;
      consultas.rango = { desde: args.where.fecha.gte, hasta: args.where.fecha.lt };
      return datos.servicios.filter(
        (s) => s.fecha >= args.where.fecha.gte && s.fecha < args.where.fecha.lt,
      );
    },
  );
  mocks.paradaFindMany.mockImplementation(async (args: { where: { tripId: { in: string[] } } }) => {
    consultas.paradas += 1;
    consultas.tripsPedidos = args.where.tripId.in;
    return datos.paradas.filter((p) => args.where.tripId.in.includes(p.tripId));
  });
  mocks.estacionFindMany.mockImplementation(async (args: { where: { id: { in: string[] } } }) => {
    consultas.estaciones += 1;
    consultas.estacionesPedidas = args.where.id.in;
    return datos.estaciones.filter((e) => args.where.id.in.includes(e.id));
  });
  mocks.horarioFindMany.mockImplementation(
    async (args: { where: { numeroTren: { in: string[] }; fecha: { gte: Date; lt: Date } } }) => {
      consultas.horarios += 1;
      consultas.numerosPedidos = args.where.numeroTren.in;
      return datos.horarios
        .filter(
          (h) =>
            args.where.numeroTren.in.includes(h.numeroTren) &&
            h.fecha >= args.where.fecha.gte &&
            h.fecha < args.where.fecha.lt,
        )
        .map((h) => ({
          numeroTren: h.numeroTren,
          fecha: h.fecha,
          salida: h.salida,
          llegada: h.llegada,
          origen: { nombre: h.origen },
          destino: { nombre: h.destino },
        }));
    },
  );
  return consultas;
}

beforeEach(() => {
  mocks.impuntualidadFindMany.mockReset();
  mocks.paradaFindMany.mockReset();
  mocks.estacionFindMany.mockReset();
  mocks.horarioFindMany.mockReset();
});

describe('TrenesService.puntualidadMes (agrupación por eje)', () => {
  it('no suma en un mismo eje los servicios de dos rutas del mismo vehículo', async () => {
    instalar({ servicios: SERVICIOS, paradas: PARADAS, estaciones: [MADRID, SEVILLA, BARCELONA] });

    const respuesta = await new TrenesService().puntualidadMes(MES);

    // V1 hace 4 servicios impuntuales en el mes:3 en Madrid→Sevilla y1 en
    // Madrid→ Barcelona. En el ranking son DOS filas, no una de4.
    expect(respuesta).toHaveLength(2);
    expect(respuesta.map((f) => f.vecesImpuntuales).sort()).toEqual([1, 3]);

    const sevilla = respuesta.find((f) => f.destinoNombre === SEVILLA.nombre);
    expect(sevilla).toMatchObject({
      clave: `eje:${MADRID.id}:${SEVILLA.id}`,
      vehiculoId: 'V1',
      numeroTren: '09073',
      vecesImpuntuales: 3,
      retrasoMedioSeg: 700, // (600 + 900 + 600) / 3
      retrasoMaxSeg: 900,
      origenNombre: MADRID.nombre,
      fecha: '2026-09-01',
    });
  });

  it('usa los nombres reales de las estaciones del eje, sin consultar HorarioTren', async () => {
    const consultas = instalar({
      servicios: SERVICIOS,
      paradas: PARADAS,
      estaciones: [MADRID, SEVILLA, BARCELONA, CORDOBA],
      // Trampa: si el enriquecimiento viejo mandase, saldrían estos nombres
      horarios: [
        {
          numeroTren: '09073',
          fecha: dia(1),
          salida: hora(7 * 60),
          llegada: hora(9 * 60 + 59),
          origen: 'Nombre Falso',
          destino: 'Otro Nombre',
        },
      ],
    });

    const respuesta = await new TrenesService().puntualidadMes(MES);

    expect(respuesta[0]?.origenNombre).toBe(MADRID.nombre);
    expect(respuesta[0]?.destinoNombre).toBe(SEVILLA.nombre);
    // Todos los grupos tienen eje → ni se piden horarios
    expect(consultas.horarios).toBe(0);
    // Solo los extremos de los trips, no la estación intermedia (Córdoba)
    expect(consultas.estacionesPedidas.sort()).toEqual(
      [MADRID.id, SEVILLA.id, BARCELONA.id].sort(),
    );
  });

  it('resuelve los extremos con ParadaHorario en una sola query (sin N+1)', async () => {
    const consultas = instalar({ servicios: SERVICIOS, paradas: PARADAS, estaciones: [MADRID] });

    await new TrenesService().puntualidadMes(MES);

    expect(consultas.paradas).toBe(1);
    expect(consultas.estaciones).toBe(1);
    expect(consultas.servicios).toBe(1);
    expect([...consultas.tripsPedidos].sort()).toEqual(['T1', 'T2', 'T3']);
    expect(consultas.rango).toEqual({ desde: DESDE, hasta: HASTA });
  });

  it('la llegada es la última parada más repetida y la estimada suma el peor retraso', async () => {
    instalar({ servicios: SERVICIOS, paradas: PARADAS, estaciones: [MADRID, SEVILLA] });

    const respuesta = await new TrenesService().puntualidadMes(MES);
    const sevilla = respuesta.find((f) => f.destinoNombre === SEVILLA.nombre);

    // T1 (09:59) aparece en2 servicios y T2 (11:00) en1: gana el más repetido
    expect(sevilla?.salida).toBe('07:00');
    expect(sevilla?.llegada).toBe('09:59');
    // 09:59 (599 min) + peor retraso (900 s =15 min) =10:14
    expect(sevilla?.llegadaEstimada).toBe('10:14');
  });

  it('la llegada estimada rueda de día si la llegada programada pasa de medianoche', async () => {
    instalar({
      servicios: [
        { tripId: 'TN', vehiculoId: 'V9', numeroTren: '09999', fecha: dia(4), retrasoMaxSeg: 600 },
      ],
      paradas: [
        { tripId: 'TN', orden: 1, estacionId: MADRID.id, salidaMin: 1380, llegadaMin: 1380 },
        { tripId: 'TN', orden: 2, estacionId: SEVILLA.id, salidaMin: 1505, llegadaMin: 1505 },
      ],
      estaciones: [MADRID, SEVILLA],
    });

    const respuesta = await new TrenesService().puntualidadMes(MES);

    expect(respuesta[0]?.llegada).toBe('01:05'); //1445 min →24:05 rueda a01:05
    expect(respuesta[0]?.llegadaEstimada).toBe('01:15'); // +10 min de retraso
  });

  it('cuenta servicios distintos (trip+fecha): repetir el mismo trip un día no suma', async () => {
    instalar({
      servicios: [
        { tripId: 'T1', vehiculoId: 'V1', numeroTren: '09073', fecha: dia(1), retrasoMaxSeg: 400 },
        { tripId: 'T1', vehiculoId: 'V1', numeroTren: '09073', fecha: dia(1), retrasoMaxSeg: 700 },
        { tripId: 'T1', vehiculoId: 'V1', numeroTren: '09073', fecha: dia(2), retrasoMaxSeg: 500 },
      ],
      paradas: PARADAS,
      estaciones: [MADRID, SEVILLA],
    });

    const respuesta = await new TrenesService().puntualidadMes(MES);

    expect(respuesta).toHaveLength(1);
    expect(respuesta[0]?.vecesImpuntuales).toBe(2); //1 y2 de septiembre
    expect(respuesta[0]?.retrasoMaxSeg).toBe(700); // el peor del1
    expect(respuesta[0]?.retrasoMedioSeg).toBe(600); // (700 + 500) / 2
  });

  it('sin paradas para el trip, agrupa por vehículo y completa con HorarioTren', async () => {
    const consultas = instalar({
      servicios: [
        {
          tripId: 'SIN-1',
          vehiculoId: 'V2',
          numeroTren: '09075',
          fecha: dia(5),
          retrasoMaxSeg: 600,
        },
      ],
      paradas: [],
      estaciones: [],
      horarios: [
        {
          numeroTren: '09075',
          fecha: dia(5),
          salida: hora(7 * 60),
          llegada: hora(7 * 60 + 59),
          origen: 'A Coruña',
          destino: 'Vilagarcía de Arousa',
        },
      ],
    });

    const respuesta = await new TrenesService().puntualidadMes(MES);

    expect(respuesta).toEqual([
      {
        clave: 'veh:V2',
        vehiculoId: 'V2',
        numeroTren: '09075',
        vecesImpuntuales: 1,
        retrasoMedioSeg: 600,
        retrasoMaxSeg: 600,
        origenNombre: 'A Coruña',
        destinoNombre: 'Vilagarcía de Arousa',
        salida: '07:00',
        llegada: '07:59',
        llegadaEstimada: '08:09',
        fecha: '2026-09-05',
      },
    ]);
    // Sin paradas no hay estaciones que pedir
    expect(consultas.estaciones).toBe(0);
  });

  it('solo pide horarios de los grupos sin eje (los del eje no se enriquecen)', async () => {
    const consultas = instalar({
      servicios: [
        ...SERVICIOS,
        {
          tripId: 'SIN-1',
          vehiculoId: 'V2',
          numeroTren: '09075',
          fecha: dia(5),
          retrasoMaxSeg: 600,
        },
      ],
      paradas: PARADAS,
      estaciones: [MADRID, SEVILLA, BARCELONA],
      horarios: [
        {
          numeroTren: '09073',
          fecha: dia(1),
          salida: hora(7 * 60),
          llegada: hora(9 * 60 + 59),
          origen: 'Nombre Falso',
          destino: 'Otro Nombre',
        },
        {
          numeroTren: '09075',
          fecha: dia(5),
          salida: hora(7 * 60),
          llegada: hora(7 * 60 + 59),
          origen: 'A Coruña',
          destino: 'Vilagarcía de Arousa',
        },
      ],
    });

    const respuesta = await new TrenesService().puntualidadMes(MES);

    expect(consultas.horarios).toBe(1);
    expect(consultas.numerosPedidos).not.toContain('09073'); // solo el grupo sin eje
    expect(consultas.numerosPedidos).toContain('09075');
    expect(respuesta.find((f) => f.clave?.startsWith('eje:'))?.origenNombre).toBe(MADRID.nombre);
    expect(respuesta.find((f) => f.clave === 'veh:V2')?.origenNombre).toBe('A Coruña');
  });

  it('ordena por veces (default) o por impuntualidad media', async () => {
    instalar({
      servicios: [
        ...SERVICIOS,
        // eje Zaragoza → Sevilla con un solo servicio pero peor retraso
        { tripId: 'T4', vehiculoId: 'V3', numeroTren: '12451', fecha: dia(7), retrasoMaxSeg: 2000 },
      ],
      paradas: [
        ...PARADAS,
        { tripId: 'T4', orden: 1, estacionId: ZARAGOZA.id, salidaMin: 600, llegadaMin: 600 },
        { tripId: 'T4', orden: 2, estacionId: SEVILLA.id, salidaMin: 780, llegadaMin: 780 },
      ],
      estaciones: [MADRID, SEVILLA, BARCELONA, ZARAGOZA],
    });
    const servicio = new TrenesService();

    const porVeces = await servicio.puntualidadMes(MES);
    expect(porVeces.map((f) => f.clave)).toEqual([
      `eje:${MADRID.id}:${SEVILLA.id}`, //3 veces
      `eje:${ZARAGOZA.id}:${SEVILLA.id}`, //1 vez, retraso medio mayor
      `eje:${MADRID.id}:${BARCELONA.id}`, //1 vez,300 s
    ]);

    const porImpuntualidad = await servicio.puntualidadMes(MES, 'impuntualidad');
    expect(porImpuntualidad.map((f) => f.clave)).toEqual([
      `eje:${ZARAGOZA.id}:${SEVILLA.id}`, //2000 s
      `eje:${MADRID.id}:${SEVILLA.id}`, //700 s
      `eje:${MADRID.id}:${BARCELONA.id}`, //300 s
    ]);
  });

  it('sin servicios en el mes devuelve [] sin tocar paradas ni estaciones', async () => {
    const consultas = instalar({ servicios: [], paradas: PARADAS, estaciones: [MADRID] });

    const respuesta = await new TrenesService().puntualidadMes(MES);

    expect(respuesta).toEqual([]);
    expect(consultas.paradas).toBe(0);
    expect(consultas.estaciones).toBe(0);
  });

  it('clave canónica: entradas distintas con el mismo significado comparten la caché', async () => {
    const consultas = instalar({
      servicios: SERVICIOS,
      paradas: PARADAS,
      estaciones: [MADRID, SEVILLA, BARCELONA],
    });
    const servicio = new TrenesService();

    await servicio.puntualidadMes(MES);
    // 'veces' es el orden por defecto: cualquier otra cadena no-impuntualidad
    // debe caer en la MISMA clave (si no, un ?orden=basura re-calcularía 63k filas)
    await servicio.puntualidadMes(MES, 'orden-que-no-existe');

    expect(consultas.servicios).toBe(1);
  });

  it('comparte un único cálculo entre peticiones simultáneas idénticas', async () => {
    const consultas = instalar({
      servicios: SERVICIOS,
      paradas: PARADAS,
      estaciones: [MADRID, SEVILLA, BARCELONA],
    });
    const servicio = new TrenesService();

    const respuestas = await Promise.all(
      Array.from({ length: 8 }, () => servicio.puntualidadMes(MES)),
    );

    // Single-flight: 8 llamadas → 1 query de servicios, no 8
    expect(consultas.servicios).toBe(1);
    expect(respuestas.every((r) => JSON.stringify(r) === JSON.stringify(respuestas[0]))).toBe(true);
  });

  it('si ParadaHorario no devuelve nada, todo el mes agrupa por vehículo', async () => {
    instalar({ servicios: SERVICIOS, paradas: [], estaciones: [MADRID] });

    const respuesta = await new TrenesService().puntualidadMes(MES);

    // Un solo vehículo → un solo grupo con los4 servicios
    expect(respuesta).toHaveLength(1);
    expect(respuesta[0]?.clave).toBe('veh:V1');
    expect(respuesta[0]?.vecesImpuntuales).toBe(4);
  });
});
