import type { Logger } from 'pino';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EstadoSerializado, EstadoTrenDisponible } from '@mantirenfe/shared-types';
import { esFilaEscala, minutosDeHora, sondearAlerta, textoHoraMin } from './sondeo';

/**
 * Mundo en memoria del test: la fuente devuelve los directos de la ruta (sin
 * plazas) y la disponibilidad de cada TRAMO por su par de estaciones, el prisma
 * ficticio devuelve las tablas GTFS del día (`horarioTren`/`paradaHorario`) y
 * guarda lo que el sondeo escribe, y las notificaciones acaban en `avisos`.
 *
 * Ruta de pruebas: A Coruña → Vigo sin directo con plazas, con una única escala
 * por Santiago (09183 A Coruña→Santiago + 09701 Santiago→Vigo).
 */
const FECHA = '2026-10-05';

const ESTACIONES = [
  { id: 'e-ac', codigo: 'AC', nombre: 'A Coruña' },
  { id: 'e-scl', codigo: 'SCL', nombre: 'Santiago' },
  { id: 'e-vig', codigo: 'VGO', nombre: 'Vigo' },
];

const HORARIOS = [
  {
    tripId: 'tripA',
    numeroTren: '09183',
    salida: new Date(`${FECHA}T09:00:00Z`),
    llegada: new Date(`${FECHA}T09:30:00Z`),
    origenEstacionId: 'e-ac',
    destinoEstacionId: 'e-scl',
  },
  {
    tripId: 'tripB',
    numeroTren: '09701',
    salida: new Date(`${FECHA}T09:50:00Z`),
    llegada: new Date(`${FECHA}T11:05:00Z`),
    origenEstacionId: 'e-scl',
    destinoEstacionId: 'e-vig',
  },
  // Directo GTFS de la misma ruta: la rama de escala no debe usarlo
  {
    tripId: 'tripD',
    numeroTren: '04314',
    salida: new Date(`${FECHA}T08:00:00Z`),
    llegada: new Date(`${FECHA}T10:00:00Z`),
    origenEstacionId: 'e-ac',
    destinoEstacionId: 'e-vig',
  },
];

const PARADAS = [
  { tripId: 'tripA', estacionId: 'e-ac', orden: 1, llegadaMin: null, salidaMin: 540 },
  { tripId: 'tripA', estacionId: 'e-scl', orden: 2, llegadaMin: 570, salidaMin: 575 },
  { tripId: 'tripB', estacionId: 'e-scl', orden: 1, llegadaMin: null, salidaMin: 590 },
  { tripId: 'tripB', estacionId: 'e-vig', orden: 2, llegadaMin: 665, salidaMin: null },
  { tripId: 'tripD', estacionId: 'e-ac', orden: 1, llegadaMin: null, salidaMin: 480 },
  { tripId: 'tripD', estacionId: 'e-vig', orden: 2, llegadaMin: 600, salidaMin: null },
];

const mundo = vi.hoisted(() => ({
  conexiones: true,
  criterio: 'DISPONIBILIDAD' as string,
  criterios: [] as string[],
  horaDesde: null as string | null,
  horaHasta: null as string | null,
  ultimoEstado: undefined as EstadoSerializado[] | undefined,
  /** ¿Hay plazas en el único directo A Coruña → Vigo? */
  directoDisponible: false,
  /** Plazas por tramo, clave `Origen|Destino|numeroTren`. */
  tramos: {} as Record<string, boolean>,
  avisos: [] as Array<{ titulo: string; cuerpo: string; datos: Record<string, unknown> }>,
  /** Nº de operaciones de cada transacción (1 estado + N notificaciones). */
  transacciones: [] as number[],
  /** Consultas que llegan a la fuente, en orden. */
  consultas: [] as Array<{ origen: string; destino: string; numeroTren: string | null }>,
  /** Consultas a la tabla de estaciones (la rama de escala las resuelve por id). */
  estacionesConsultadas: 0,
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
        destinoNombre: 'Vigo',
        origenEstacionId: 'e-ac',
        destinoEstacionId: 'e-vig',
        fechaViaje: new Date(`${FECHA}T00:00:00Z`),
        recurrente: false,
        fechaFlexible: false,
        horaDesde: mundo.horaDesde,
        horaHasta: mundo.horaHasta,
        numeroTren: null,
        criterio: mundo.criterio,
        criterios: mundo.criterios,
        precioObjetivo: null,
        conexiones: mundo.conexiones,
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
      findFirst: vi.fn(async () => null),
      create: async (args: { data: { titulo: string; cuerpo: string; datos: unknown } }) => {
        mundo.avisos.push(
          args.data as { titulo: string; cuerpo: string; datos: Record<string, unknown> },
        );
        return args.data;
      },
    },
    precioTren: { createMany: async () => 0, deleteMany: async () => 0 },
    // GTFS del día: el cargador de itinerarios trabaja sobre estas filas
    horarioTren: { findMany: async () => HORARIOS },
    paradaHorario: { findMany: async () => PARADAS },
    estacion: {
      findMany: async () => {
        mundo.estacionesConsultadas += 1;
        return ESTACIONES;
      },
    },
    // Estado y avisos se guardan juntos: el mock cuenta las operaciones del
    // lote para poder comprobar que van en la MISMA transacción.
    $transaction: async (operaciones: Array<Promise<unknown>>) => {
      mundo.transacciones.push(operaciones.length);
      return Promise.all(operaciones);
    },
  }),
}));

vi.mock('../fuentes', () => ({
  crearFuenteDatos: () => ({
    nombre: 'mock',
    getDisponibilidad: async (consulta: {
      origenNombre: string;
      destinoNombre: string;
      fecha: string;
      numeroTren?: string | null;
    }) => {
      mundo.consultas.push({
        origen: consulta.origenNombre,
        destino: consulta.destinoNombre,
        numeroTren: consulta.numeroTren ?? null,
      });
      const esRuta = consulta.origenNombre === 'A Coruña' && consulta.destinoNombre === 'Vigo';
      const trenes: EstadoTrenDisponible[] = esRuta
        ? [
            {
              trenId: `04314-${consulta.fecha}`,
              numeroTren: '04314',
              salida: '08:00',
              disponible: mundo.directoDisponible,
              precioMin: 30,
              moneda: 'EUR',
              tramo: 'directo',
            },
          ]
        : [
            {
              trenId: `${consulta.numeroTren ?? 'x'}-${consulta.fecha}`,
              numeroTren: consulta.numeroTren ?? 'x',
              salida: '09:00',
              disponible:
                mundo.tramos[
                  `${consulta.origenNombre}|${consulta.destinoNombre}|${consulta.numeroTren ?? ''}`
                ] === true,
              precioMin: 15,
              moneda: 'EUR',
              tramo: 'directo',
            },
          ];
      return { consulta, consultadoEn: new Date().toISOString(), trenes };
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

/** Fila del estado guardado para el directo del día (todo el sondeo compara con ella). */
function directoGuardado(disponible: boolean): EstadoSerializado {
  return {
    trenId: `04314-${FECHA}`,
    numeroTren: '04314',
    salida: '08:00',
    disponible,
    precioMin: 30,
    cancelado: false,
    criterio: 'DISPONIBILIDAD',
  };
}

/** Estado inicial: el directo visto en el sondeo anterior y sin escala aún. */
function sembrar(): void {
  mundo.ultimoEstado = [directoGuardado(false)];
}

async function sondear(): Promise<void> {
  await sondearAlerta('a1', logger);
}

beforeEach(() => {
  vi.clearAllMocks();
  mundo.conexiones = true;
  mundo.criterio = 'DISPONIBILIDAD';
  mundo.criterios = ['DISPONIBILIDAD'];
  mundo.horaDesde = null;
  mundo.horaHasta = null;
  mundo.ultimoEstado = undefined;
  mundo.directoDisponible = false;
  mundo.tramos = {};
  mundo.avisos = [];
  mundo.transacciones = [];
  mundo.consultas = [];
  mundo.estacionesConsultadas = 0;
});

describe('rama de conexiones del criterio DISPONIBILIDAD', () => {
  it('directo sin plazas y escala con los dos tramos con plazas: avisa', async () => {
    sembrar();
    mundo.tramos = {
      'A Coruña|Santiago|09183': true,
      'Santiago|Vigo|09701': true,
    };

    await sondear();

    expect(mundo.avisos).toHaveLength(1);
    const aviso = mundo.avisos[0]!;
    expect(aviso.titulo).toBe('¡Plaza disponible con escala!');
    expect(aviso.cuerpo).toBe(
      'Plazas en tu ida con escala: 09:00 A Coruña→Santiago (09183) + 09:50 Santiago→Vigo (09701), llegada 11:05 · A Coruña → Vigo el 2026-10-05',
    );
    expect(aviso.datos).toMatchObject({ tipo: 'escala', criterio: 'DISPONIBILIDAD' });

    // El estado guarda la fila de la escala con sus trips: es su identidad
    const escala = mundo.ultimoEstado?.find(esFilaEscala);
    expect(escala).toMatchObject({
      trenId: 'escala|tripA|tripB',
      numeroTren: '09183 + 09701',
      salida: '09:00',
      disponible: true,
      tramo: 'conexion',
      conexionEn: 'Santiago',
      esperaMin: 20,
      horaLlegada: '11:05',
      criterio: 'DISPONIBILIDAD',
    });
    // Estado + notificación en la MISMA transacción (patrón multi-criterio)
    expect(mundo.transacciones).toEqual([2]);
    // Una consulta por tramo implicado además de la del directo (≤ 10 con 5
    // itinerarios candidatos) y ninguna repetida
    expect(mundo.consultas.map((c) => `${c.origen}→${c.destino}:${c.numeroTren}`)).toEqual([
      'A Coruña→Vigo:null',
      'A Coruña→Santiago:09183',
      'Santiago→Vigo:09701',
    ]);
  });

  it('sin plazas en ningún tramo no avisa y no guarda escala', async () => {
    sembrar();

    await sondear();

    expect(mundo.avisos).toHaveLength(0);
    expect(mundo.ultimoEstado?.some(esFilaEscala)).toBe(false);
    // El directo y el primer tramo: si ese ya no tiene plazas, el segundo
    // tramo del mismo itinerario ni se consulta (se corta en el primero)
    expect(mundo.consultas.map((c) => `${c.origen}→${c.destino}:${c.numeroTren}`)).toEqual([
      'A Coruña→Vigo:null',
      'A Coruña→Santiago:09183',
    ]);

    // Repite sin cambios: sigue sin avisar ni guardar escala
    await sondear();
    expect(mundo.avisos).toHaveLength(0);
    expect(mundo.ultimoEstado?.some(esFilaEscala)).toBe(false);
  });

  it('el segundo sondeo sin cambios no repite el aviso', async () => {
    sembrar();
    mundo.tramos = {
      'A Coruña|Santiago|09183': true,
      'Santiago|Vigo|09701': true,
    };

    await sondear();
    expect(mundo.avisos).toHaveLength(1);

    await sondear();
    expect(mundo.avisos).toHaveLength(1);
    expect(mundo.transacciones).toEqual([2, 1]);
  });

  it('sin la casilla marcada no se mira la escala (cero regresión)', async () => {
    sembrar();
    mundo.conexiones = false;
    mundo.tramos = {
      'A Coruña|Santiago|09183': true,
      'Santiago|Vigo|09701': true,
    };

    await sondear();

    expect(mundo.avisos).toHaveLength(0);
    // Ni consulta la venta de los tramos ni toca la tabla de estaciones
    expect(mundo.consultas).toHaveLength(1);
    expect(mundo.estacionesConsultadas).toBe(0);
    expect(mundo.ultimoEstado?.some(esFilaEscala)).toBe(false);
  });

  it('si el directo tiene plazas no se evalúa la escala', async () => {
    sembrar();
    mundo.directoDisponible = true;
    mundo.tramos = {
      'A Coruña|Santiago|09183': true,
      'Santiago|Vigo|09701': true,
    };

    await sondear();

    // Aviso normal de directo, sin duplicarlo con uno de escala
    expect(mundo.avisos).toHaveLength(1);
    expect(mundo.avisos[0]?.titulo).toBe('¡Plaza disponible!');
    expect(mundo.consultas).toHaveLength(1);
    expect(mundo.estacionesConsultadas).toBe(0);
    expect(mundo.ultimoEstado?.some(esFilaEscala)).toBe(false);
  });

  it('solo cuenta el tramo si la venta lista ese tren suelto con plazas', async () => {
    sembrar();
    // Solo el primer tramo tiene plazas: la escala no es comprable
    mundo.tramos = { 'A Coruña|Santiago|09183': true };

    await sondear();

    expect(mundo.avisos).toHaveLength(0);
    expect(mundo.ultimoEstado?.some(esFilaEscala)).toBe(false);
  });

  it('la franja horaria acota los itinerarios candidatos', async () => {
    sembrar();
    // La escala sale a las 09:00 y llega a las 11:05: con una franja que
    // empieza a las 10:00 no hay candidato y no se llega a consultar la venta
    mundo.horaDesde = '10:00';
    mundo.tramos = {
      'A Coruña|Santiago|09183': true,
      'Santiago|Vigo|09701': true,
    };

    await sondear();

    expect(mundo.avisos).toHaveLength(0);
    expect(mundo.consultas).toHaveLength(1);
    expect(mundo.ultimoEstado?.some(esFilaEscala)).toBe(false);
  });
});

describe('utilidades de la rama de conexiones', () => {
  it('textoHoraMin da la vuelta a los minutos que pasan de medianoche', () => {
    expect(textoHoraMin(540)).toBe('09:00');
    expect(textoHoraMin(665)).toBe('11:05');
    expect(textoHoraMin(1500)).toBe('01:00');
  });

  it('minutosDeHora solo acepta horas HH:MM', () => {
    expect(minutosDeHora('09:00')).toBe(540);
    expect(minutosDeHora('23:59')).toBe(1439);
    expect(minutosDeHora('')).toBeUndefined();
    expect(minutosDeHora(null)).toBeUndefined();
    expect(minutosDeHora('9:00')).toBeUndefined();
    expect(minutosDeHora('24:00')).toBeUndefined();
  });

  it('esFilaEscala reconoce solo el id de un itinerario con escala', () => {
    expect(esFilaEscala({ trenId: 'escala|tripA|tripB' })).toBe(true);
    expect(esFilaEscala({ trenId: '04314-2026-10-05' })).toBe(false);
    expect(esFilaEscala({ trenId: 'c-2026-10-05-09201-00622' })).toBe(false);
  });
});
