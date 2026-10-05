import type { Logger } from 'pino';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EstadoSerializado, EstadoTrenDisponible } from '@mantirenfe/shared-types';
import {
  criteriosDeAlerta,
  estadoAnteriorPorCriterio,
  etiquetaEstado,
  sondearAlerta,
} from './sondeo';

/**
 * Mundo en memoria del test: cada fuente devuelve los trenes de SU criterio
 * (la etiqueta con la que el sondeo la consulta), el prisma ficticio devuelve
 * `criterios`/`ultimoEstado` y guarda lo que el sondeo escribe, y las
 * notificaciones creadas acaban en `mundo.avisos`.
 */
const mundo = vi.hoisted(() => ({
  criterio: 'DISPONIBILIDAD' as string,
  criterios: [] as string[],
  precioObjetivo: null as number | null,
  trenes: {} as Record<string, EstadoTrenDisponible[]>,
  ultimoEstado: undefined as EstadoSerializado[] | undefined,
  avisos: [] as Array<{ titulo: string; cuerpo: string; datos: Record<string, unknown> }>,
  /** Nº de operaciones de cada transacción (1 estado + N notificaciones). */
  transacciones: [] as number[],
  /** Etiquetas de fuente consultadas, en orden. */
  consultas: [] as string[],
}));

vi.mock('@mantirenfe/database', () => ({
  buscarEstaciones: async () => [],
  normalizarTexto: (texto: string) => texto,
  getPrisma: () => ({
    alerta: {
      findUnique: async () => ({
        id: 'a1',
        usuarioId: 'u1',
        origenNombre: 'A Coruña',
        destinoNombre: 'Madrid',
        fechaViaje: new Date('2026-10-05T00:00:00.000Z'),
        recurrente: false,
        fechaFlexible: false,
        horaDesde: null,
        horaHasta: null,
        numeroTren: null,
        criterio: mundo.criterio,
        criterios: mundo.criterios,
        precioObjetivo: mundo.precioObjetivo,
        estado: 'ACTIVA',
        intervaloSondeoMin: 10,
        ultimoEstado: mundo.ultimoEstado,
        usuario: { email: null, preferencias: '{}', suscripciones: [], tokensMovil: [] },
      }),
      update: async (args: { data: Record<string, unknown> }) => {
        if ('ultimoEstado' in args.data) {
          mundo.ultimoEstado = args.data.ultimoEstado as EstadoSerializado[];
        }
        return args.data;
      },
      // El claim de sondeo siempre gana en este mundo (sin carreras en el test)
      updateMany: async () => ({ count: 1 }),
    },
    notificacion: {
      create: async (args: { data: { titulo: string; cuerpo: string; datos: unknown } }) => {
        mundo.avisos.push(
          args.data as { titulo: string; cuerpo: string; datos: Record<string, unknown> },
        );
        return args.data;
      },
    },
    precioTren: { createMany: async () => 0, deleteMany: async () => 0 },
    // Estado y avisos se guardan juntos: el mock cuenta las operaciones del
    // lote para poder comprobar que van en la MISMA transacción.
    $transaction: async (operaciones: Array<Promise<unknown>>) => {
      mundo.transacciones.push(operaciones.length);
      return Promise.all(operaciones);
    },
  }),
}));

vi.mock('../fuentes', () => ({
  // Cada criterio consulta a su fuente: el sondeo pide UNA consulta por fuente
  // distinta (etiqueta), que es lo que este mock registra.
  crearFuenteDatos: (criterio: string) => ({
    nombre: `fuente-${criterio}`,
    getDisponibilidad: async () => {
      mundo.consultas.push(criterio);
      return {
        consulta: {},
        consultadoEn: new Date().toISOString(),
        trenes: mundo.trenes[criterio] ?? [],
      };
    },
  }),
}));

vi.mock('../notificaciones/web-push', () => ({ enviarPush: vi.fn(async () => undefined) }));
vi.mock('../notificaciones/expo-push', () => ({ enviarPushMovil: vi.fn(async () => undefined) }));

const logger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
} as unknown as Logger;

/** Tren de la fuente de venta (DISPONIBILIDAD/PRECIO). */
function venta(parcial: Partial<EstadoTrenDisponible>): EstadoTrenDisponible {
  return {
    trenId: 'v1',
    numeroTren: '04314',
    salida: '2026-10-05T07:35:00.000Z',
    disponible: true,
    precioMin: null,
    moneda: 'EUR',
    ...parcial,
  };
}

/** Tren de la fuente de retrasos (GTFS-RT). */
function retraso(parcial: Partial<EstadoTrenDisponible>): EstadoTrenDisponible {
  return {
    trenId: 'r1',
    numeroTren: '04315',
    salida: '2026-10-05T08:00:00.000Z',
    disponible: true,
    precioMin: null,
    moneda: 'EUR',
    ...parcial,
  };
}

/** Fila del estado guardado, con su criterio (o sin él, como el legado). */
function guardado(parcial: Partial<EstadoSerializado> & { trenId: string }): EstadoSerializado {
  return {
    numeroTren: '04314',
    salida: '2026-10-05T07:35:00.000Z',
    disponible: true,
    precioMin: null,
    retrasoSeg: null,
    cancelado: false,
    ...parcial,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mundo.criterio = 'DISPONIBILIDAD';
  mundo.criterios = [];
  mundo.precioObjetivo = null;
  mundo.trenes = {};
  mundo.ultimoEstado = undefined;
  mundo.avisos = [];
  mundo.transacciones = [];
  mundo.consultas = [];
});

describe('criteriosDeAlerta (lista vigilada)', () => {
  it('la lista manda y sin lista se usa el criterio legado', () => {
    expect(criteriosDeAlerta({ criterio: 'RETRASO' })).toEqual(['RETRASO']);
    expect(
      criteriosDeAlerta({ criterio: 'DISPONIBILIDAD', criterios: ['RETRASO', 'PRECIO'] }),
    ).toEqual(['RETRASO', 'PRECIO']);
    expect(criteriosDeAlerta({ criterio: 'HORARIO', criterios: [] })).toEqual(['HORARIO']);
  });

  it('DISPONIBILIDAD y APERTURA_VENTA comparan lo mismo: se evalúa una sola', () => {
    expect(
      criteriosDeAlerta({
        criterio: 'APERTURA_VENTA',
        criterios: ['APERTURA_VENTA', 'DISPONIBILIDAD', 'RETRASO'],
      }),
    ).toEqual(['DISPONIBILIDAD', 'RETRASO']);
    // Sin DISPONIBILIDAD, APERTURA_VENTA se queda tal cual
    expect(
      criteriosDeAlerta({ criterio: 'APERTURA_VENTA', criterios: ['APERTURA_VENTA'] }),
    ).toEqual(['APERTURA_VENTA']);
  });
});

describe('etiquetaEstado (con qué nombre se guarda cada serie)', () => {
  it('los criterios que comparten fuente comparten serie', () => {
    const criterios = ['DISPONIBILIDAD', 'PRECIO'];
    expect(etiquetaEstado('DISPONIBILIDAD', criterios)).toBe('DISPONIBILIDAD');
    expect(etiquetaEstado('PRECIO', criterios)).toBe('DISPONIBILIDAD');
  });

  it('cada fuente distinta guarda su propia serie', () => {
    const criterios = ['RETRASO', 'DISPONIBILIDAD', 'HORARIO'];
    expect(etiquetaEstado('RETRASO', criterios)).toBe('RETRASO');
    expect(etiquetaEstado('DISPONIBILIDAD', criterios)).toBe('DISPONIBILIDAD');
    expect(etiquetaEstado('HORARIO', criterios)).toBe('HORARIO');
  });
});

describe('estadoAnteriorPorCriterio (el estado guardado)', () => {
  it('agrupa por criterio y lo sin etiquetar va al criterio legado', () => {
    const mapa = estadoAnteriorPorCriterio(
      [
        guardado({ trenId: 'a', criterio: 'RETRASO' }),
        guardado({ trenId: 'b' }),
        guardado({ trenId: 'c', criterio: 'DISPONIBILIDAD' }),
      ],
      'HORARIO',
    );
    expect(mapa.get('RETRASO')?.map((t) => t.trenId)).toEqual(['a']);
    expect(mapa.get('DISPONIBILIDAD')?.map((t) => t.trenId)).toEqual(['c']);
    expect(mapa.get('HORARIO')?.map((t) => t.trenId)).toEqual(['b']);
  });

  it('sin estado guardado no hay series que comparar', () => {
    expect(estadoAnteriorPorCriterio(null, 'DISPONIBILIDAD').size).toBe(0);
    expect(estadoAnteriorPorCriterio({}, 'DISPONIBILIDAD').size).toBe(0);
  });
});

describe('sondeo de una alerta multi-criterio', () => {
  it('avisa una vez por criterio que cambia, todo en la misma transacción', async () => {
    mundo.criterio = 'DISPONIBILIDAD';
    mundo.criterios = ['DISPONIBILIDAD', 'RETRASO'];
    mundo.trenes = {
      DISPONIBILIDAD: [venta({ disponible: true })],
      RETRASO: [retraso({ retrasoSeg: 600 })],
    };
    mundo.ultimoEstado = [
      guardado({ trenId: 'v1', disponible: false, criterio: 'DISPONIBILIDAD' }),
      guardado({
        trenId: 'r1',
        numeroTren: '04315',
        salida: '2026-10-05T08:00:00.000Z',
        retrasoSeg: null,
        criterio: 'RETRASO',
      }),
    ];

    await sondearAlerta('a1', logger);

    // Cada fuente se consulta una vez y el estado guarda una serie por criterio
    expect(mundo.consultas).toEqual(['DISPONIBILIDAD', 'RETRASO']);
    expect(mundo.ultimoEstado?.map((t) => t.criterio)).toEqual(['DISPONIBILIDAD', 'RETRASO']);

    expect(mundo.avisos.map((a) => a.titulo)).toEqual(['¡Plaza disponible!', 'Retraso en tu tren']);
    expect(mundo.avisos.map((a) => a.datos.criterio)).toEqual(['DISPONIBILIDAD', 'RETRASO']);
    // 1 escritura del estado + 2 notificaciones, en el MISMO lote
    expect(mundo.transacciones).toEqual([3]);
  });

  it('cada criterio compara contra SU estado: el siguiente sondeo no reavisa', async () => {
    mundo.criterio = 'DISPONIBILIDAD';
    mundo.criterios = ['DISPONIBILIDAD', 'RETRASO'];
    mundo.trenes = {
      DISPONIBILIDAD: [venta({ disponible: true })],
      RETRASO: [retraso({ retrasoSeg: 600 })],
    };
    mundo.ultimoEstado = [
      guardado({ trenId: 'v1', disponible: false, criterio: 'DISPONIBILIDAD' }),
      guardado({
        trenId: 'r1',
        numeroTren: '04315',
        salida: '2026-10-05T08:00:00.000Z',
        retrasoSeg: null,
        criterio: 'RETRASO',
      }),
    ];

    await sondearAlerta('a1', logger);
    expect(mundo.avisos).toHaveLength(2);

    mundo.avisos = [];
    await sondearAlerta('a1', logger);
    expect(mundo.avisos).toHaveLength(0);
    expect(mundo.transacciones).toEqual([3, 1]);
  });

  it('PRECIO y DISPONIBILIDAD comparten fuente: una consulta y dos avisos', async () => {
    mundo.criterio = 'DISPONIBILIDAD';
    mundo.criterios = ['DISPONIBILIDAD', 'PRECIO'];
    mundo.precioObjetivo = 35;
    mundo.trenes = { DISPONIBILIDAD: [venta({ disponible: true, precioMin: 30 })] };
    mundo.ultimoEstado = [
      guardado({ trenId: 'v1', disponible: false, precioMin: 40, criterio: 'DISPONIBILIDAD' }),
    ];

    await sondearAlerta('a1', logger);

    // Misma fuente: se consulta una sola vez y NO se duplica el estado
    expect(mundo.consultas).toEqual(['DISPONIBILIDAD']);
    expect(mundo.ultimoEstado).toHaveLength(1);
    expect(mundo.avisos.map((a) => a.titulo)).toEqual([
      '¡Plaza disponible!',
      'Precio bajo tu objetivo',
    ]);
    expect(mundo.transacciones).toEqual([3]);
  });

  it('PRECIO solo se evalúa si está en la lista de criterios', async () => {
    mundo.criterio = 'DISPONIBILIDAD';
    mundo.criterios = ['DISPONIBILIDAD'];
    // El umbral puede estar guardado: sin PRECIO en la lista no se vigila
    mundo.precioObjetivo = 35;
    mundo.trenes = { DISPONIBILIDAD: [venta({ disponible: true, precioMin: 30 })] };
    mundo.ultimoEstado = [
      guardado({ trenId: 'v1', disponible: true, precioMin: 40, criterio: 'DISPONIBILIDAD' }),
    ];

    await sondearAlerta('a1', logger);

    expect(mundo.avisos).toHaveLength(0);
    expect(mundo.consultas).toEqual(['DISPONIBILIDAD']);
  });

  it('el estado de una alerta legada (sin campo criterio) sirve para la suya', async () => {
    mundo.criterio = 'RETRASO';
    mundo.criterios = ['RETRASO'];
    mundo.trenes = { RETRASO: [retraso({ retrasoSeg: 600 })] };
    // Estado escrito por una versión anterior: no trae criterio en las filas
    mundo.ultimoEstado = [
      guardado({
        trenId: 'r1',
        numeroTren: '04315',
        salida: '2026-10-05T08:00:00.000Z',
        retrasoSeg: null,
      }),
    ];

    await sondearAlerta('a1', logger);

    expect(mundo.avisos).toHaveLength(1);
    expect(mundo.avisos[0]?.titulo).toBe('Retraso en tu tren');
    // Y el estado que deja ya va etiquetado para los próximos sondeos
    expect(mundo.ultimoEstado?.[0]?.criterio).toBe('RETRASO');
  });

  it('en el primer sondeo solo se guarda el estado, aunque haya dos criterios', async () => {
    mundo.criterio = 'DISPONIBILIDAD';
    mundo.criterios = ['DISPONIBILIDAD', 'RETRASO'];
    mundo.trenes = {
      DISPONIBILIDAD: [venta({ disponible: true })],
      RETRASO: [retraso({ retrasoSeg: 600 })],
    };

    await sondearAlerta('a1', logger);

    expect(mundo.avisos).toHaveLength(0);
    expect(mundo.transacciones).toEqual([1]);
    expect(mundo.ultimoEstado?.map((t) => t.criterio)).toEqual(['DISPONIBILIDAD', 'RETRASO']);
  });
});
