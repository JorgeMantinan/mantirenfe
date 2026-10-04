import type { Logger } from 'pino';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EstadoSerializado, EstadoTrenDisponible } from '@mantirenfe/shared-types';
import {
  cuerpoAvisoFlexible,
  fechasSondeoFlexible,
  parsearEstadoFlexible,
  sondearAlerta,
  SONDEOS_FLEXIBLE_POR_ALERTA,
} from './sondeo';

/** Rango de prueba corto: 2026-10-05 … 2026-10-12 (8 días → tramos de 2). */
const DESDE = '2026-10-05';
const HASTA = '2026-10-12';

/**
 * Mundo en memoria del test: la fuente consulta las fechas de `mundo.fechas`
 * (las que tienen plazas), el prisma ficticio devuelve `estadoFlexible` y
 * guarda lo que el sondeo escribe, y los avisos acaban en `mundo.avisos`.
 */
const mundo = vi.hoisted(() => ({
  fechaDesde: '2026-10-05',
  fechaHasta: '2026-10-12',
  estadoFlexible: undefined as unknown,
  ultimoEstado: undefined as EstadoSerializado[] | undefined,
  conPlazas: new Set<string>(),
  fallan: new Set<string>(),
  consultas: [] as string[],
  avisos: [] as Array<{ titulo: string; cuerpo: string; datos: unknown }>,
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
        fechaViaje: new Date(`${mundo.fechaDesde}T00:00:00.000Z`),
        recurrente: false,
        fechaFlexible: true,
        fechaDesde: new Date(`${mundo.fechaDesde}T00:00:00.000Z`),
        fechaHasta: new Date(`${mundo.fechaHasta}T00:00:00.000Z`),
        estadoFlexible: mundo.estadoFlexible,
        horaDesde: null,
        horaHasta: null,
        numeroTren: null,
        criterio: 'APERTURA_VENTA',
        estado: 'ACTIVA',
        intervaloSondeoMin: 10,
        ultimoEstado: mundo.ultimoEstado,
        usuario: { email: null, preferencias: '{}', suscripciones: [], tokensMovil: [] },
      }),
      update: async (args: { data: Record<string, unknown> }) => {
        if ('estadoFlexible' in args.data) mundo.estadoFlexible = args.data.estadoFlexible;
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
    getDisponibilidad: async (consulta: { fecha: string }) => {
      mundo.consultas.push(consulta.fecha);
      if (mundo.fallan.has(consulta.fecha)) throw new Error('venta.renfe.com no responde');
      const trenes: EstadoTrenDisponible[] = mundo.conPlazas.has(consulta.fecha)
        ? [
            {
              trenId: `04314-${consulta.fecha}`,
              numeroTren: '04314',
              salida: '07:35',
              disponible: true,
              precioMin: 32,
              moneda: 'EUR',
            },
          ]
        : [];
      return {
        consulta,
        consultadoEn: new Date().toISOString(),
        trenes,
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

/** Un sondeo completo; devuelve las fechas consultadas en él. */
async function sondear(): Promise<string[]> {
  const antes = mundo.consultas.length;
  await sondearAlerta('a1', logger);
  return mundo.consultas.slice(antes);
}

beforeEach(() => {
  vi.clearAllMocks();
  mundo.estadoFlexible = undefined;
  mundo.ultimoEstado = undefined;
  mundo.conPlazas = new Set();
  mundo.fallan = new Set();
  mundo.consultas = [];
  mundo.avisos = [];
});

describe('fechasSondeoFlexible (rotación)', () => {
  it('consulta como mucho N fechas y cubre el rango por tramos', () => {
    const rango = fechasSondeoFlexible(DESDE, HASTA, 0);
    expect(rango).toHaveLength(4);
    expect(rango).toEqual(['2026-10-05', '2026-10-07', '2026-10-09', '2026-10-11']);

    // El siguiente índice rota dentro de cada tramo y no se sale del rango
    expect(fechasSondeoFlexible(DESDE, HASTA, 1)).toEqual([
      '2026-10-06',
      '2026-10-08',
      '2026-10-10',
      '2026-10-12',
    ]);
    // Al cerrar el ciclo vuelve a las fechas del primer sondeo
    expect(fechasSondeoFlexible(DESDE, HASTA, 2)).toEqual(rango);
  });

  it('nunca devuelve más de N fechas, ni repetidas', () => {
    for (let indice = 0; indice < 20; indice++) {
      const fechas = fechasSondeoFlexible(DESDE, HASTA, indice);
      expect(fechas.length).toBeLessThanOrEqual(SONDEOS_FLEXIBLE_POR_ALERTA);
      expect(new Set(fechas).size).toBe(fechas.length);
      for (const fecha of fechas) {
        expect(fecha >= DESDE).toBe(true);
        expect(fecha <= HASTA).toBe(true);
      }
    }
  });

  it('reparte un rango grande de 6 meses en N tramos (una fecha por zona)', () => {
    // 181 días → 4 tramos de 45, 45, 45 y 46 días
    const sumar = (dias: number) => {
      const [anio, mes, dia] = DESDE.split('-').map(Number);
      return new Date(Date.UTC(anio, mes - 1, dia + dias)).toISOString().slice(0, 10);
    };
    const desde = DESDE;
    const hasta = '2027-04-03';
    expect(fechasSondeoFlexible(desde, hasta, 0)).toEqual([0, 45, 90, 135].map(sumar));
    // Rotando el índice, cada tramo avanza un día dentro de su zona
    expect(fechasSondeoFlexible(desde, hasta, 1)).toEqual([1, 46, 91, 136].map(sumar));
    // Y el índice nunca se sale del tramo
    const conIndiceGrande = fechasSondeoFlexible(desde, hasta, 999);
    expect(conIndiceGrande).toHaveLength(4);
    for (const fecha of conIndiceGrande) {
      expect(fecha >= desde).toBe(true);
      expect(fecha <= hasta).toBe(true);
    }
  });

  it('con un rango de un solo día solo consulta esa fecha', () => {
    expect(fechasSondeoFlexible(DESDE, DESDE, 7)).toEqual([DESDE]);
    // Rango invertido (no debería existir): se acota al inicio
    expect(fechasSondeoFlexible(HASTA, DESDE, 0)).toEqual([HASTA]);
  });
});

describe('parsearEstadoFlexible', () => {
  it('tolera JSON ausente, de otra forma o con basura', () => {
    expect(parsearEstadoFlexible(undefined)).toEqual({ indice: 0, fechas: {} });
    expect(parsearEstadoFlexible(null)).toEqual({ indice: 0, fechas: {} });
    expect(parsearEstadoFlexible([])).toEqual({ indice: 0, fechas: {} });
    expect(parsearEstadoFlexible({ indice: -3, fechas: 'x' })).toEqual({ indice: 0, fechas: {} });
    expect(
      parsearEstadoFlexible({
        indice: 2,
        fechas: { '2026-10-05': true, mal: 1, 'no-fecha': true },
      }),
    ).toEqual({ indice: 2, fechas: { '2026-10-05': true } });
  });
});

describe('cuerpoAvisoFlexible', () => {
  it('cita la fecha concreta con hora y precio, y el trayecto al final', () => {
    const trenes: EstadoSerializado[] = [
      {
        trenId: '04314-2026-10-09',
        numeroTren: '04314',
        salida: '07:35',
        disponible: true,
        precioMin: 32,
        cancelado: false,
      },
      {
        trenId: '00622-2026-10-09',
        numeroTren: '00622',
        salida: '15:10',
        disponible: true,
        precioMin: null,
        cancelado: false,
      },
    ];
    const cuerpo = cuerpoAvisoFlexible('A Coruña → Madrid', [{ fecha: '2026-10-09', trenes }]);

    // 2026-10-09 es jueves9 de octubre
    expect(cuerpo).toContain('Hay plazas el 9 de octubre');
    expect(cuerpo).toContain('07:35 desde 32,00 €');
    expect(cuerpo).toContain('15:10');
    expect(cuerpo.endsWith('A Coruña → Madrid')).toBe(true);
  });
});

describe('sondeo de una alerta con fecha flexible', () => {
  it('consulta N fechas por sondeo y va rotando el índice', async () => {
    expect(await sondear()).toHaveLength(SONDEOS_FLEXIBLE_POR_ALERTA);
    expect(mundo.estadoFlexible).toMatchObject({ indice: 1 });

    const segundo = await sondear();
    expect(segundo).toHaveLength(SONDEOS_FLEXIBLE_POR_ALERTA);
    expect(mundo.estadoFlexible).toMatchObject({ indice: 2 });
    // El segundo sondeo mira las fechas que quedaron en los otros tramos
    expect(segundo).toEqual(['2026-10-06', '2026-10-08', '2026-10-10', '2026-10-12']);
    expect(new Set([...mundo.consultas]).size).toBe(8);
  });

  it('no avisa en la primera visita a cada fecha (aunque ya haya billetes)', async () => {
    mundo.conPlazas.add('2026-10-05');

    await sondear();
    await sondear();
    expect(mundo.avisos).toHaveLength(0);

    // El estado sí se guarda: la próxima vez que toque esa fecha ya hay baseline
    expect(mundo.estadoFlexible).toMatchObject({
      fechas: { '2026-10-05': true, '2026-10-07': false },
    });
  });

  it('avisa con la fecha concreta cuando una fecha del rango abre', async () => {
    await sondear(); // baseline de 05, 07, 09 y 11 (sin plazas)
    await sondear(); // baseline de 06, 08, 10 y 12

    mundo.conPlazas.add('2026-10-09');
    const tercer = await sondear();

    expect(tercer).toEqual(['2026-10-05', '2026-10-07', '2026-10-09', '2026-10-11']);
    expect(mundo.avisos).toHaveLength(1);
    const aviso = mundo.avisos[0]!;
    expect(aviso.titulo).toBe('¡Billetes a la venta!');
    expect(aviso.cuerpo).toContain('Hay plazas el 9 de octubre');
    expect(aviso.cuerpo).toContain('A Coruña → Madrid');
    expect(aviso.datos).toMatchObject({ tipo: 'apertura', fechas: ['2026-10-09'] });

    // Sigue disponible en el siguiente ciclo: no repite el aviso
    await sondear();
    mundo.conPlazas.delete('2026-10-10');
    await sondear();
    await sondear();
    expect(mundo.avisos).toHaveLength(1);

    // Desaparece y vuelve a abrir: el aviso vuelve a estar permitido
    mundo.conPlazas.delete('2026-10-09');
    await sondear(); // vuelve a dejar 09 en false
    mundo.conPlazas.add('2026-10-09');
    await sondear();
    await sondear();
    expect(mundo.avisos).toHaveLength(2);
  });

  it('una fecha que falla no aborta el sondeo de las demás', async () => {
    mundo.fallan.add('2026-10-07');

    await sondear(); // 07 falla; el resto deja su baseline
    await sondear();
    mundo.conPlazas.add('2026-10-09');
    const tercer = await sondear();

    expect(tercer).toEqual(['2026-10-05', '2026-10-07', '2026-10-09', '2026-10-11']);
    expect(mundo.avisos).toHaveLength(1);
    expect(mundo.avisos[0]!.cuerpo).toContain('9 de octubre');
    expect(logger.warn).toHaveBeenCalled();
    // La fecha fallida no registra baseline y la que se abre sí queda guardada
    const estado = mundo.estadoFlexible as { fechas: Record<string, boolean> };
    expect(estado.fechas['2026-10-07']).toBeUndefined();
    expect(estado.fechas['2026-10-09']).toBe(true);
  });

  it('el estado guardado sirve de base para el detalle (ultimoEstado)', async () => {
    mundo.conPlazas.add('2026-10-05');
    await sondear();

    expect(mundo.ultimoEstado).toHaveLength(1);
    expect(mundo.ultimoEstado?.[0]).toMatchObject({ trenId: '04314-2026-10-05', salida: '07:35' });
  });
});
