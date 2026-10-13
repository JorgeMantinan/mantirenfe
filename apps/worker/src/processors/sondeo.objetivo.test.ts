import type { Logger } from 'pino';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EstadoSerializado, EstadoTrenDisponible } from '@mantirenfe/shared-types';
import { sondearAlerta } from './sondeo';

/**
 * Fecha objetivo de una alerta recurrente con `diasSemana`: el sondeo trabaja
 * cualquier día evaluando el PRÓXIMO día marcado (un martes mira el viernes),
 * y el estado guardado solo se compara contra la MISMA fecha objetivo (si
 * cambia, es primera vez para esa fecha: línea base y sin avisos).
 *
 * El mundo es el de `sondeo.precio.test.ts`: la fuente devuelve `trenes` y
 * anota la fecha consultada, prisma devuelve `mundo` y guarda lo que el
 * sondeo escribe, y los avisos acaban en `mundo.avisos`.
 */
const mundo = vi.hoisted(() => ({
  recurrente: true as boolean,
  diasSemana: [0, 5] as number[],
  fechaViaje: new Date('2026-12-31T00:00:00.000Z'),
  fechaObjetivoSondeo: null as Date | null,
  criterio: 'DISPONIBILIDAD' as string,
  precioObjetivo: null as number | null,
  trenes: [] as EstadoTrenDisponible[],
  ultimoEstado: undefined as EstadoSerializado[] | undefined,
  avisos: [] as Array<{ titulo: string; cuerpo: string; datos: Record<string, unknown> }>,
  /** Fechas que llegan a la fuente (lo que consulta cada sondeo). */
  consultas: [] as string[],
  /** `data` de cada `alerta.update` del sondeo. */
  guardados: [] as Array<Record<string, unknown>>,
  /** Resultado del claim atómico: 1 = reclamada, 0 = ya sondeada. */
  reclamada: 1,
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
        fechaViaje: mundo.fechaViaje,
        recurrente: mundo.recurrente,
        diasSemana: mundo.diasSemana,
        fechaObjetivoSondeo: mundo.fechaObjetivoSondeo,
        fechaFlexible: false,
        horaDesde: null,
        horaHasta: null,
        numeroTren: null,
        criterio: mundo.criterio,
        criterios: [],
        precioObjetivo: mundo.precioObjetivo,
        conexiones: false,
        estado: 'ACTIVA',
        intervaloSondeoMin: 10,
        ultimoEstado: mundo.ultimoEstado,
        usuario: { email: null, preferencias: '{}', suscripciones: [], tokensMovil: [] },
      }),
      update: async (args: { data: Record<string, unknown> }) => {
        mundo.guardados.push(args.data);
        if ('ultimoEstado' in args.data) {
          mundo.ultimoEstado = args.data.ultimoEstado as EstadoSerializado[];
        }
        if ('fechaObjetivoSondeo' in args.data) {
          mundo.fechaObjetivoSondeo = args.data.fechaObjetivoSondeo as Date;
        }
        return args.data;
      },
      // El claim de sondeo siempre gana en este mundo (sin carreras en el test)
      updateMany: async () => ({ count: mundo.reclamada }),
    },
    notificacion: {
      findFirst: vi.fn(async () => null),
      create: async (args: { data: { titulo: string; cuerpo: string; datos: unknown } }) => {
        mundo.avisos.push(
          args.data as { titulo: string; cuerpo: string; datos: Record<string, unknown> },
        );
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
    getDisponibilidad: async (consulta: { fecha: string }) => {
      mundo.consultas.push(consulta.fecha);
      return {
        consulta,
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

/** Tren tal y como lo devuelve la fuente de venta. */
function tren(
  trenId: string,
  { disponible, precioMin = null }: { disponible: boolean; precioMin?: number | null },
): EstadoTrenDisponible {
  return {
    trenId,
    numeroTren: '04314',
    salida: `${trenId.slice(-10)}T07:35:00.000Z`,
    disponible,
    precioMin,
    moneda: 'EUR',
  };
}

/** El mismo tren tal y como queda guardado en `ultimoEstado`. */
function fila(
  trenId: string,
  { disponible, precioMin = null }: { disponible: boolean; precioMin?: number | null },
): EstadoSerializado {
  return {
    trenId,
    numeroTren: '04314',
    salida: `${trenId.slice(-10)}T07:35:00.000Z`,
    disponible,
    precioMin,
    cancelado: false,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // Solo se congela el reloj: el resto de timers (promesas, await) sigue real
  vi.useFakeTimers({ toFake: ['Date'] });
  // 2026-10-06 es martes (2026-10-04 fue domingo)
  vi.setSystemTime(new Date('2026-10-06T09:00:00.000Z'));
  mundo.recurrente = true;
  mundo.diasSemana = [0, 5];
  mundo.fechaViaje = new Date('2026-12-31T00:00:00.000Z');
  mundo.fechaObjetivoSondeo = null;
  mundo.criterio = 'DISPONIBILIDAD';
  mundo.precioObjetivo = null;
  mundo.trenes = [];
  mundo.ultimoEstado = undefined;
  mundo.avisos = [];
  mundo.consultas = [];
  mundo.guardados = [];
  mundo.reclamada = 1;
});

afterEach(() => {
  vi.useRealTimers();
});

describe('fecha objetivo del sondeo', () => {
  it('una alerta dom+vie sondeada un martes consulta el viernes próximo', async () => {
    mundo.trenes = [tren('04314-2026-10-09', { disponible: true })];

    await sondearAlerta('a1', logger);

    expect(mundo.consultas).toEqual(['2026-10-09']);
    // Primer contacto con esa fecha: línea base, sin avisos
    expect(mundo.avisos).toHaveLength(0);
    // Y la fecha objetivo viaja con el estado, en la misma transacción
    expect(mundo.guardados[0]?.fechaObjetivoSondeo).toEqual(new Date('2026-10-09T00:00:00Z'));
    expect(Array.isArray(mundo.guardados[0]?.ultimoEstado)).toBe(true);
  });

  it('si hoy ya toca, la fecha objetivo es el propio día', async () => {
    // 2026-10-09 es viernes
    vi.setSystemTime(new Date('2026-10-09T09:00:00.000Z'));
    mundo.trenes = [tren('04314-2026-10-09', { disponible: true })];

    await sondearAlerta('a1', logger);

    expect(mundo.consultas).toEqual(['2026-10-09']);
  });

  it('la alerta no recurrente sigue su fecha de viaje (sin cambios)', async () => {
    mundo.recurrente = false;
    mundo.fechaViaje = new Date('2026-10-20T00:00:00.000Z');
    // Una fecha objetivo heredada no debe interferir con lo puntual
    mundo.fechaObjetivoSondeo = new Date('2026-01-01T00:00:00.000Z');
    mundo.ultimoEstado = [fila('04314-2026-10-20', { disponible: false })];
    mundo.trenes = [tren('04314-2026-10-20', { disponible: true })];

    await sondearAlerta('a1', logger);

    expect(mundo.consultas).toEqual(['2026-10-20']);
    // Difiere normal (no se trata como primera vez): sí avisa de la plaza
    expect(mundo.avisos).toHaveLength(1);
    expect(mundo.avisos[0]?.titulo).toBe('¡Plaza disponible!');
  });
});

describe('avisos con fecha objetivo estable y cambio de fecha', () => {
  it('con la misma fecha objetivo no reavisa (tras el reset diario)', async () => {
    // Estado guardado el mismo martes para el mismo viernes: el reset diario ya
    // no borra `ultimoEstado`, así que el sondeo compara y no vuelve a avisar
    mundo.fechaObjetivoSondeo = new Date('2026-10-09T00:00:00Z');
    mundo.ultimoEstado = [fila('04314-2026-10-09', { disponible: true })];
    mundo.trenes = [tren('04314-2026-10-09', { disponible: true })];

    await sondearAlerta('a1', logger);

    expect(mundo.avisos).toHaveLength(0);
    expect(mundo.consultas).toEqual(['2026-10-09']);
    expect(mundo.guardados[0]?.fechaObjetivoSondeo).toEqual(new Date('2026-10-09T00:00:00Z'));
    expect(mundo.guardados[0]?.ultimoEstado).toHaveLength(1);
  });

  it('avisa en cuanto hay plaza para ese viernes', async () => {
    mundo.fechaObjetivoSondeo = new Date('2026-10-09T00:00:00Z');
    mundo.ultimoEstado = [fila('04314-2026-10-09', { disponible: false })];
    mundo.trenes = [tren('04314-2026-10-09', { disponible: true })];

    await sondearAlerta('a1', logger);

    expect(mundo.avisos).toHaveLength(1);
    expect(mundo.avisos[0]?.titulo).toBe('¡Plaza disponible!');
    expect(mundo.avisos[0]?.cuerpo).toContain('el 2026-10-09');
  });

  it('al cambiar la fecha objetivo el estado anterior no dispara avisos', async () => {
    // El viernes evaluado pasa a ser el siguiente: el estado previo es de los
    // trenes del 02 y compararlo haría parecer "nuevo y barato" todo lo del 09
    mundo.criterio = 'PRECIO';
    mundo.precioObjetivo = 35;
    mundo.fechaObjetivoSondeo = new Date('2026-10-02T00:00:00Z');
    mundo.ultimoEstado = [fila('04314-2026-10-02', { disponible: true, precioMin: 32 })];
    mundo.trenes = [tren('04314-2026-10-09', { disponible: true, precioMin: 32 })];

    await sondearAlerta('a1', logger);

    expect(mundo.consultas).toEqual(['2026-10-09']);
    expect(mundo.avisos).toHaveLength(0);
    // La fecha nueva queda registrada con su línea base
    expect(mundo.guardados[0]?.fechaObjetivoSondeo).toEqual(new Date('2026-10-09T00:00:00Z'));
    expect((mundo.ultimoEstado ?? [])[0]?.trenId).toBe('04314-2026-10-09');
  });

  it('el claim atómico corta el sondeo si otro job ya lo reclamó', async () => {
    mundo.reclamada = 0;
    mundo.trenes = [tren('04314-2026-10-09', { disponible: true })];

    await sondearAlerta('a1', logger);

    expect(mundo.consultas).toHaveLength(0);
    expect(mundo.guardados).toHaveLength(0);
    expect(mundo.avisos).toHaveLength(0);
  });
});
