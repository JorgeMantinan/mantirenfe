import { describe, expect, it } from 'vitest';
import { trayectosPorParadas, type BaseParadas, type EstacionBuscada } from './paradas';

interface FilaHorarioDia {
  tripId: string | null;
  numeroTren: string;
  operador: string | null;
}

interface FilaParada {
  tripId: string;
  estacionId: string;
  orden: number;
  llegadaMin: number | null;
  salidaMin: number | null;
}

const FECHA = '2026-09-28';
const A_CORUNA: EstacionBuscada = { id: '31412', nombre: 'A Coruña' };
const VILAGARCIA: EstacionBuscada = { id: '23008', nombre: 'Vilagarcía de Arousa' };
const SANTIAGO: EstacionBuscada = { id: '31400', nombre: 'Santiago de Compostela' };

/**
 * Doble en memoria: aplica los mismos filtros que Prisma (estacionId ∈ y
 * tripId ∈) para que el test también verifique QUÉ ids manda la query.
 */
function crearBase(dia: FilaHorarioDia[], paradas: FilaParada[]) {
  const consultas: Array<{ modelo: string; estaciones?: string[]; trips?: number }> = [];
  const base: BaseParadas = {
    horarioTren: {
      findMany: async (args) => {
        consultas.push({ modelo: 'horarioTren' });
        expect(args.where.fecha.toISOString()).toBe(`${FECHA}T00:00:00.000Z`);
        return dia;
      },
    },
    paradaHorario: {
      findMany: async (args) => {
        consultas.push({
          modelo: 'paradaHorario',
          estaciones: args.where.estacionId.in,
          trips: args.where.tripId.in.length,
        });
        return paradas.filter(
          (p) =>
            args.where.estacionId.in.includes(p.estacionId) &&
            args.where.tripId.in.includes(p.tripId),
        );
      },
    },
  };
  return { base, consultas };
}

/** Viaje A Coruña → Santiago → Vilagarcía (parada intermedia en destino). */
const VIAJE_INTERMEDIO: FilaParada[] = [
  { tripId: 'T1', estacionId: '31412', orden: 1, salidaMin: 7 * 60, llegadaMin: 7 * 60 },
  { tripId: 'T1', estacionId: '31400', orden: 2, salidaMin: 7 * 60 + 30, llegadaMin: 7 * 60 + 32 },
  { tripId: 'T1', estacionId: '23008', orden: 3, salidaMin: 7 * 60 + 59, llegadaMin: 7 * 60 + 59 },
];

describe('trayectosPorParadas (trayectos con parada intermedia)', () => {
  it('recompone A Coruña → Vilagarcía con horas, duración y número de tren', async () => {
    const { base } = crearBase(
      [{ tripId: 'T1', numeroTren: '09073', operador: 'MD' }],
      VIAJE_INTERMEDIO,
    );

    const resultado = await trayectosPorParadas(base, {
      fecha: FECHA,
      origenes: [A_CORUNA],
      destinos: [VILAGARCIA],
    });

    expect(resultado).toEqual([
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
  });

  it('solo incluye los viajes que operan ese día (HorarioTren con tripId)', async () => {
    const { base } = crearBase(
      // T2 no opera hoy; una fila antigua sin tripId tampoco sirve
      [{ tripId: null, numeroTren: '09074', operador: null }],
      [
        ...VIAJE_INTERMEDIO,
        { tripId: 'T2', estacionId: '31412', orden: 1, salidaMin: 8 * 60, llegadaMin: 8 * 60 },
        { tripId: 'T2', estacionId: '23008', orden: 4, salidaMin: 9 * 60, llegadaMin: 9 * 60 },
      ],
    );

    const resultado = await trayectosPorParadas(base, {
      fecha: FECHA,
      origenes: [A_CORUNA],
      destinos: [VILAGARCIA],
    });

    expect(resultado).toEqual([]);
  });

  it('descarta el destino si en el viaje viene antes que el origen', async () => {
    const { base } = crearBase(
      [{ tripId: 'T3', numeroTren: '12451', operador: null }],
      [
        // Vilagarcía (orden1) antes que A Coruña (orden2): no se puede viajar
        { tripId: 'T3', estacionId: '23008', orden: 1, salidaMin: 6 * 60, llegadaMin: 6 * 60 },
        { tripId: 'T3', estacionId: '31412', orden: 2, salidaMin: 7 * 60, llegadaMin: 7 * 60 },
      ],
    );

    const resultado = await trayectosPorParadas(base, {
      fecha: FECHA,
      origenes: [A_CORUNA],
      destinos: [VILAGARCIA],
    });

    expect(resultado).toEqual([]);
  });

  it('usa la primera parada de destino posterior al origen', async () => {
    const { base } = crearBase(
      [{ tripId: 'T4', numeroTren: '09075', operador: 'MD' }],
      [
        { tripId: 'T4', estacionId: '31412', orden: 1, salidaMin: 6 * 60, llegadaMin: 6 * 60 },
        { tripId: 'T4', estacionId: '23008', orden: 4, salidaMin: 7 * 60, llegadaMin: 7 * 60 },
        // segunda parada en Vilagarcía (el tren repite): no debe duplicarse
        { tripId: 'T4', estacionId: '23008', orden: 9, salidaMin: 8 * 60, llegadaMin: 8 * 60 },
      ],
    );

    const resultado = await trayectosPorParadas(base, {
      fecha: FECHA,
      origenes: [A_CORUNA],
      destinos: [VILAGARCIA],
    });

    expect(resultado).toHaveLength(1);
    expect(resultado[0]?.llegada).toBe('2026-09-28T07:00:00.000Z');
    expect(resultado[0]?.duracionMin).toBe(60);
  });

  it('si la búsqueda coincide con varias estaciones, usa la salida más temprana', async () => {
    const { base } = crearBase(
      [{ tripId: 'T5', numeroTren: '09076', operador: null }],
      [
        // "A Coruña" puede casar con "A Coruña" y con "A Coruña-Turístico"
        { tripId: 'T5', estacionId: '99143', orden: 1, salidaMin: 6 * 60, llegadaMin: 6 * 60 },
        {
          tripId: 'T5',
          estacionId: '31412',
          orden: 2,
          salidaMin: 6 * 60 + 10,
          llegadaMin: 6 * 60 + 10,
        },
        { tripId: 'T5', estacionId: '23008', orden: 3, salidaMin: 7 * 60, llegadaMin: 7 * 60 },
      ],
    );

    const resultado = await trayectosPorParadas(base, {
      fecha: FECHA,
      origenes: [A_CORUNA, { id: '99143', nombre: 'A Coruña-Turístico' }],
      destinos: [VILAGARCIA],
    });

    expect(resultado).toHaveLength(1);
    expect(resultado[0]?.origenNombre).toBe('A Coruña-Turístico');
    expect(resultado[0]?.salida).toBe('2026-09-28T06:00:00.000Z');
  });

  it('ordena por salida y respeta el límite de50', async () => {
    const paradas: FilaParada[] = [];
    const dia: FilaHorarioDia[] = [];
    for (let i = 0; i < 60; i++) {
      const tripId = `T${i}`;
      const salidaMin = 5 * 60 + i;
      paradas.push(
        { tripId, estacionId: '31412', orden: 1, salidaMin, llegadaMin: salidaMin },
        {
          tripId,
          estacionId: '23008',
          orden: 2,
          salidaMin: salidaMin + 45,
          llegadaMin: salidaMin + 45,
        },
      );
      dia.push({ tripId, numeroTren: `090${i}`, operador: null });
    }
    // mete uno al final para comprobar que el corte es por orden, no por id
    const { base } = crearBase(dia, paradas);

    const resultado = await trayectosPorParadas(base, {
      fecha: FECHA,
      origenes: [A_CORUNA],
      destinos: [VILAGARCIA],
    });

    expect(resultado).toHaveLength(50);
    expect(resultado[0]?.numeroTren).toBe('0900');
    expect(resultado[49]?.numeroTren).toBe('09049');
    const salidas = resultado.map((r) => r.salida);
    expect([...salidas].sort()).toEqual(salidas);
  });

  it('si el destino queda tras la medianoche, la hora cruza de día', async () => {
    const { base } = crearBase(
      [{ tripId: 'T6', numeroTren: '09999', operador: null }],
      [
        {
          tripId: 'T6',
          estacionId: '31412',
          orden: 1,
          salidaMin: 23 * 60 + 30,
          llegadaMin: 23 * 60 + 30,
        },
        {
          tripId: 'T6',
          estacionId: '23008',
          orden: 2,
          salidaMin: 25 * 60 + 5,
          llegadaMin: 25 * 60 + 5,
        },
      ],
    );

    const resultado = await trayectosPorParadas(base, {
      fecha: FECHA,
      origenes: [A_CORUNA],
      destinos: [VILAGARCIA],
    });

    expect(resultado[0]?.salida).toBe('2026-09-28T23:30:00.000Z');
    expect(resultado[0]?.llegada).toBe('2026-09-29T01:05:00.000Z');
    expect(resultado[0]?.duracionMin).toBe(95);
  });

  it('devuelve [] sin viajes ese día o sin estaciones', async () => {
    const vacio = crearBase([], VIAJE_INTERMEDIO);
    expect(
      await trayectosPorParadas(vacio.base, {
        fecha: FECHA,
        origenes: [A_CORUNA],
        destinos: [VILAGARCIA],
      }),
    ).toEqual([]);
    expect(
      await trayectosPorParadas(vacio.base, { fecha: FECHA, origenes: [], destinos: [SANTIAGO] }),
    ).toEqual([]);
  });

  it('acota el segundo pedido de paradas a los viajes con origen', async () => {
    const { base, consultas } = crearBase(
      [{ tripId: 'T1', numeroTren: '09073', operador: null }],
      [
        ...VIAJE_INTERMEDIO,
        // viaje que sale de Santiago: no debe arrastrarse al pedido de destino
        { tripId: 'T7', estacionId: '31400', orden: 1, salidaMin: 5 * 60, llegadaMin: 5 * 60 },
        { tripId: 'T7', estacionId: '23008', orden: 2, salidaMin: 6 * 60, llegadaMin: 6 * 60 },
      ],
    );

    await trayectosPorParadas(base, {
      fecha: FECHA,
      origenes: [A_CORUNA, SANTIAGO],
      destinos: [VILAGARCIA],
    });

    const porParadas = consultas.filter((c) => c.modelo === 'paradaHorario');
    expect(porParadas).toHaveLength(2);
    expect(porParadas[0]?.trips).toBe(1); // solo T1 opera hoy
    expect(porParadas[1]?.trips).toBe(1); // y solo ese viaje tiene origen
  });
});
