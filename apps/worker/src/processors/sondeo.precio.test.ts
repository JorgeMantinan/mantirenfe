import type { Logger } from 'pino';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EstadoSerializado, EstadoTrenDisponible } from '@mantirenfe/shared-types';
import { sondearAlerta } from './sondeo';

/**
 * Mundo en memoria del test: la fuente devuelve `trenes`, el prisma ficticio
 * devuelve `ultimoEstado` y guarda lo que el sondeo escribe, y las
 * notificaciones creadas acaban en `avisos`.
 */
const mundo = vi.hoisted(() => ({
  criterio: 'PRECIO' as string,
  precioObjetivo: 35 as number | null,
  trenes: [] as EstadoTrenDisponible[],
  ultimoEstado: undefined as EstadoSerializado[] | undefined,
  avisos: [] as Array<{ titulo: string; cuerpo: string; datos: unknown }>,
  /** Resultado del claim atómico: 1 = reclamada, 0 = ya sondeada. */
  reclamada: 1,
  /** Consultas que llegan a la fuente (el claim corta antes). */
  consultas: 0,
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
        horaDesde: null,
        horaHasta: null,
        numeroTren: null,
        criterio: mundo.criterio,
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
      updateMany: async () => ({ count: mundo.reclamada }),
    },
    notificacion: {
      create: async (args: { data: { titulo: string; cuerpo: string; datos: unknown } }) => {
        mundo.avisos.push(args.data);
        return args.data;
      },
    },
    precioTren: { createMany: async () => 0, deleteMany: async () => 0 },
    // El estado y los avisos se guardan juntos: el mock ejecuta cada operación
    $transaction: async (operaciones: Array<Promise<unknown>>) => Promise.all(operaciones),
  }),
}));

vi.mock('../fuentes', () => ({
  crearFuenteDatos: () => ({
    nombre: 'mock',
    getDisponibilidad: async () => {
      mundo.consultas += 1;
      return {
        consulta: {},
        consultadoEn: new Date().toISOString(),
        trenes: mundo.trenes,
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

function tren(precioMin: number | null, numero = '04314'): EstadoTrenDisponible {
  return {
    trenId: numero,
    numeroTren: numero,
    salida: '2026-10-05T07:35:00.000Z',
    disponible: true,
    precioMin,
    moneda: 'EUR',
  };
}

function guardado(precioMin: number | null, numero = '04314'): EstadoSerializado {
  return {
    trenId: numero,
    numeroTren: numero,
    salida: '2026-10-05T07:35:00.000Z',
    disponible: true,
    precioMin,
    cancelado: false,
  };
}

/** Un sondeo completo con el estado previo y el estado actual dados. */
async function sondear(
  previo: EstadoSerializado[] | undefined,
  actual: Array<number | null>,
): Promise<void> {
  mundo.ultimoEstado = previo;
  // Número de tren coherente con `guardado`: el primero es siempre 04314
  mundo.trenes = actual.map((precio, i) => tren(precio, `0431${i + 4}`));
  await sondearAlerta('a1', logger);
}

beforeEach(() => {
  vi.clearAllMocks();
  mundo.criterio = 'PRECIO';
  mundo.precioObjetivo = 35;
  mundo.trenes = [];
  mundo.ultimoEstado = undefined;
  mundo.avisos = [];
  mundo.reclamada = 1;
  mundo.consultas = 0;
});

describe('sondeo con criterio PRECIO', () => {
  it('no avisa en el primer sondeo aunque el precio ya esté bajo el objetivo', async () => {
    await sondear(undefined, [32]);
    expect(mundo.avisos).toHaveLength(0);
    // El estado sí se guarda: el próximo sondeo ya tiene con qué comparar
    expect(mundo.ultimoEstado?.[0]?.precioMin).toBe(32);
  });

  it('avisa cuando un tren baja hasta el precio objetivo', async () => {
    await sondear([guardado(40)], [32]);

    expect(mundo.avisos).toHaveLength(1);
    const aviso = mundo.avisos[0]!;
    expect(aviso.titulo).toBe('Precio bajo tu objetivo');
    expect(aviso.cuerpo).toBe(
      'Tren 04314 07:35 a 32,00 € (tu objetivo: ≤35,00 €) · A Coruña → Madrid',
    );
    expect(aviso.datos).toMatchObject({ tipo: 'precio', precioObjetivo: 35 });
  });

  it('no repite el aviso mientras el tren siga por debajo del objetivo', async () => {
    await sondear([guardado(32)], [32]);
    await sondear(mundo.ultimoEstado, [31]);
    expect(mundo.avisos).toHaveLength(0);

    // Solo cuenta la transición «por encima → por debajo» del umbral
    await sondear([guardado(40)], [34]);
    expect(mundo.avisos).toHaveLength(1);
    expect(mundo.avisos[0]!.cuerpo).toContain('34,00 €');
  });

  it('vuelve a avisar si el precio sube y luego vuelve a entrar en el objetivo', async () => {
    await sondear([guardado(32)], [40]);
    expect(mundo.avisos).toHaveLength(0);

    await sondear(mundo.ultimoEstado, [33]);
    expect(mundo.avisos).toHaveLength(1);
    expect(mundo.avisos[0]!.cuerpo).toContain('33,00 €');
  });

  it('no avisa si el precio sigue por encima del objetivo o no es conocido', async () => {
    await sondear([guardado(40)], [40]);
    await sondear(mundo.ultimoEstado, [null]);
    expect(mundo.avisos).toHaveLength(0);
  });

  it('avisa solo de los trenes que entran en el umbral', async () => {
    await sondear([guardado(40, '04314'), guardado(50, '04315')], [34, 49]);

    expect(mundo.avisos).toHaveLength(1);
    expect(mundo.avisos[0]!.cuerpo).toContain('Tren 04314');
    expect(mundo.avisos[0]!.cuerpo).not.toContain('Tren 04315');
  });

  it('sin precioObjetivo no notifica (el zod lo impide al crear)', async () => {
    mundo.precioObjetivo = null;
    await sondear([guardado(40)], [32]);

    expect(mundo.avisos).toHaveLength(0);
    expect(logger.warn).toHaveBeenCalled();
  });

  it('con un objetivo más alto avisa ya en el primer diff', async () => {
    mundo.precioObjetivo = 45;
    await sondear([guardado(50)], [42]);

    expect(mundo.avisos).toHaveLength(1);
    expect(mundo.avisos[0]!.cuerpo).toContain('≤45,00 €');
  });

  it('el claim atómico corta el sondeo si otro job ya lo reclamó', async () => {
    mundo.reclamada = 0;
    await sondear([guardado(40)], [32]);

    // Ni consulta la fuente ni pisa el estado ni notifica
    expect(mundo.consultas).toBe(0);
    expect(mundo.ultimoEstado).toEqual([guardado(40)]);
    expect(mundo.avisos).toHaveLength(0);
  });
});
