import { describe, expect, it } from 'vitest';
import {
  componerItinerarios,
  type EntradaHorario,
  type EntradaParada,
  type OpcionesItinerarios,
} from './itinerarios';

// Estaciones sintéticas del escenario peninsular de pruebas.
const ORIGEN = 'est-origen';
const DESTINO = 'est-destino';
const X1 = 'est-enlace-1';
const X2 = 'est-enlace-2';
const Y = 'est-otra';

/** Date con la hora peninsular codificada como UTC (igual que HorarioTren). */
function fechaDe(minutos: number): Date {
  return new Date(Date.UTC(2026, 9, 5, 0, minutos, 0, 0));
}

/** Fila de horario sintética (extremos del viaje). */
function h(
  tripId: string,
  numeroTren: string,
  salidaMin: number,
  llegadaMin: number,
  origenEstacionId: string,
  destinoEstacionId: string,
): EntradaHorario {
  return {
    tripId,
    numeroTren,
    salida: fechaDe(salidaMin),
    llegada: fechaDe(llegadaMin),
    origenEstacionId,
    destinoEstacionId,
  };
}

/** Parada sintética (minutos del día de servicio; pueden superar 1440). */
function p(
  tripId: string,
  estacionId: string,
  orden: number,
  llegadaMin: number | null,
  salidaMin: number | null,
): EntradaParada {
  return { tripId, estacionId, orden, llegadaMin, salidaMin };
}

/** Horarios del escenario de escala: A va de ORIGEN a X1, B de X1 a DESTINO. */
function horariosEscala(salidaBEnX1: number): EntradaHorario[] {
  return [h('TA', '04301', 360, 420, ORIGEN, X1), h('TB', '04401', salidaBEnX1, 540, X1, DESTINO)];
}

/** Paradas del escenario de escala (A sale a las 06:00 y llega a X1 a las 07:00). */
function paradasEscala(salidaBEnX1: number): EntradaParada[] {
  return [
    p('TA', ORIGEN, 1, null, 360),
    p('TA', X1, 2, 420, 422),
    p('TB', X1, 1, null, salidaBEnX1),
    p('TB', DESTINO, 2, 540, null),
  ];
}

function opciones(parcial: Partial<OpcionesItinerarios>): OpcionesItinerarios {
  return {
    horarios: [],
    paradas: [],
    origenId: ORIGEN,
    destinoId: DESTINO,
    ...parcial,
  };
}

describe('componerItinerarios: directos', () => {
  it('compone un directo con los minutos peninsulares de los Date (codificados como UTC)', () => {
    const res = componerItinerarios(
      opciones({
        horarios: [h('TD', '04201', 375, 525, ORIGEN, DESTINO)],
      }),
    );

    expect(res).toHaveLength(1);
    expect(res[0]?.tipo).toBe('directo');
    expect(res[0]?.esperaMin).toBe(0);
    expect(res[0]?.llegadaTotalMin).toBe(525);
    expect(res[0]?.tramos).toEqual([
      {
        numeroTren: '04201',
        tripId: 'TD',
        estacionOrigenId: ORIGEN,
        estacionDestinoId: DESTINO,
        salidaMin: 375,
        llegadaMin: 525,
      },
    ]);
  });

  it('ordena primero los directos por llegada, aunque una escala llegue antes', () => {
    const res = componerItinerarios(
      opciones({
        horarios: [
          h('T2', '04210', 480, 600, ORIGEN, DESTINO),
          h('T1', '04201', 420, 500, ORIGEN, DESTINO),
          h('TA', '04301', 360, 400, ORIGEN, X1),
          h('TB', '04401', 430, 450, X1, DESTINO),
        ],
        paradas: [
          p('TA', ORIGEN, 1, null, 360),
          p('TA', X1, 2, 400, 402),
          p('TB', X1, 1, null, 430),
          p('TB', DESTINO, 2, 450, null),
        ],
      }),
    );

    expect(res.map((i) => i.tipo)).toEqual(['directo', 'directo', 'escala']);
    expect(res.map((i) => i.llegadaTotalMin)).toEqual([500, 600, 450]);
  });

  it('deduplica los directos por trip y conserva el de llegada más temprana', () => {
    const res = componerItinerarios(
      opciones({
        horarios: [
          h('TD', '04201', 375, 525, ORIGEN, DESTINO),
          h('TD', '04201', 390, 540, ORIGEN, DESTINO),
        ],
      }),
    );

    expect(res).toHaveLength(1);
    expect(res[0]?.llegadaTotalMin).toBe(525);
  });

  it('limita el número de resultados con maxResultados', () => {
    const res = componerItinerarios(
      opciones({
        horarios: [
          h('T3', '04203', 600, 700, ORIGEN, DESTINO),
          h('T1', '04201', 360, 500, ORIGEN, DESTINO),
          h('T2', '04202', 480, 600, ORIGEN, DESTINO),
        ],
        maxResultados: 2,
      }),
    );

    expect(res.map((i) => i.tramos[0]?.tripId)).toEqual(['T1', 'T2']);
  });
});

describe('componerItinerarios: escalas', () => {
  it('compone una escala válida con espera de 25 minutos (>= 20 por defecto)', () => {
    const res = componerItinerarios(
      opciones({ horarios: horariosEscala(445), paradas: paradasEscala(445) }),
    );

    expect(res).toHaveLength(1);
    expect(res[0]?.tipo).toBe('escala');
    expect(res[0]?.esperaMin).toBe(25);
    expect(res[0]?.llegadaTotalMin).toBe(540);
    expect(res[0]?.tramos).toEqual([
      {
        numeroTren: '04301',
        tripId: 'TA',
        estacionOrigenId: ORIGEN,
        estacionDestinoId: X1,
        salidaMin: 360,
        llegadaMin: 420,
      },
      {
        numeroTren: '04401',
        tripId: 'TB',
        estacionOrigenId: X1,
        estacionDestinoId: DESTINO,
        salidaMin: 445,
        llegadaMin: 540,
      },
    ]);
  });

  it('rechaza la escala cuando la espera (10) es menor que el enlace mínimo (20)', () => {
    const res = componerItinerarios(
      opciones({ horarios: horariosEscala(430), paradas: paradasEscala(430) }),
    );

    expect(res).toEqual([]);
  });

  it('respeta un enlaceMin personalizado', () => {
    const datos = { horarios: horariosEscala(445), paradas: paradasEscala(445) };

    expect(componerItinerarios(opciones({ ...datos, enlaceMin: 30 }))).toEqual([]);
    expect(componerItinerarios(opciones({ ...datos, enlaceMin: 25 }))).toHaveLength(1);
  });

  it('no usa el destino como estación de enlace (X = destino)', () => {
    const res = componerItinerarios(
      opciones({
        horarios: [
          h('TA', '04301', 360, 420, ORIGEN, DESTINO),
          h('TB', '04401', 430, 445, Y, DESTINO),
        ],
        paradas: [
          p('TA', ORIGEN, 1, null, 360),
          p('TA', DESTINO, 2, 420, 422),
          p('TB', Y, 1, null, 430),
          // Salida no nula en DESTINO: sin la regla X != destino nacería una escala.
          p('TB', DESTINO, 2, 445, 445),
        ],
      }),
    );

    expect(res).toHaveLength(1);
    expect(res[0]?.tipo).toBe('directo');
  });

  it('descarta la pierna A si la parada de origen no tiene salidaMin', () => {
    const res = componerItinerarios(
      opciones({
        horarios: horariosEscala(445),
        paradas: [
          p('TA', ORIGEN, 1, null, null),
          p('TA', X1, 2, 420, 422),
          ...paradasEscala(445).slice(2),
        ],
      }),
    );

    expect(res).toEqual([]);
  });

  it('usa la salidaMin en X como llegada cuando A no informa llegadaMin (espera 0 en esa parada)', () => {
    const res = componerItinerarios(
      opciones({
        horarios: horariosEscala(445),
        paradas: [
          p('TA', ORIGEN, 1, null, 360),
          p('TA', X1, 2, null, 420),
          ...paradasEscala(445).slice(2),
        ],
      }),
    );

    expect(res).toHaveLength(1);
    expect(res[0]?.tramos[0]?.llegadaMin).toBe(420);
    expect(res[0]?.esperaMin).toBe(25);
  });

  it('ordena las escalas con la misma llegada por menor espera', () => {
    const res = componerItinerarios(
      opciones({
        horarios: [
          h('T-A1', '04301', 360, 400, ORIGEN, X1),
          h('T-B1', '04401', 460, 500, X1, DESTINO),
          h('T-A2', '04302', 360, 400, ORIGEN, X2),
          h('T-B2', '04402', 430, 500, X2, DESTINO),
        ],
        paradas: [
          p('T-A1', ORIGEN, 1, null, 360),
          p('T-A1', X1, 2, 400, 402),
          p('T-B1', X1, 1, null, 460),
          p('T-B1', DESTINO, 2, 500, null),
          p('T-A2', ORIGEN, 1, null, 360),
          p('T-A2', X2, 2, 400, 402),
          p('T-B2', X2, 1, null, 430),
          p('T-B2', DESTINO, 2, 500, null),
        ],
      }),
    );

    expect(res).toHaveLength(2);
    expect(res.map((i) => i.esperaMin)).toEqual([30, 60]);
    expect(res[0]?.tramos[0]?.estacionDestinoId).toBe(X2);
  });

  it('deduplica por pareja [tripA, tripB] aunque haya dos estaciones de enlace', () => {
    const res = componerItinerarios(
      opciones({
        horarios: [h('TA', '04301', 360, 440, ORIGEN, X2), h('TB', '04401', 450, 500, X1, DESTINO)],
        paradas: [
          p('TA', ORIGEN, 1, null, 360),
          p('TA', X1, 2, 420, 422),
          p('TA', X2, 3, 440, 442),
          p('TB', X1, 1, null, 450),
          p('TB', X2, 2, 465, 467),
          p('TB', DESTINO, 3, 500, null),
        ],
      }),
    );

    expect(res).toHaveLength(1);
    expect(res[0]?.esperaMin).toBe(27);
    expect(res[0]?.tramos[0]?.estacionDestinoId).toBe(X2);
  });

  it('conserva los minutos por encima de 1440 del día de servicio anterior', () => {
    const res = componerItinerarios(
      opciones({
        horarios: [
          h('TA', '04301', 1420, 1500, ORIGEN, X1),
          h('TB', '04401', 1525, 1620, X1, DESTINO),
        ],
        paradas: [
          p('TA', ORIGEN, 1, null, 1420),
          p('TA', X1, 2, 1500, 1502),
          p('TB', X1, 1, null, 1525),
          p('TB', DESTINO, 2, 1620, null),
        ],
      }),
    );

    expect(res).toHaveLength(1);
    expect(res[0]?.tramos[0]?.salidaMin).toBe(1420);
    expect(res[0]?.tramos[0]?.llegadaMin).toBe(1500);
    expect(res[0]?.tramos[1]?.salidaMin).toBe(1525);
    expect(res[0]?.esperaMin).toBe(25);
    expect(res[0]?.llegadaTotalMin).toBe(1620);
    expect(res[0]?.llegadaTotalMin).toBeGreaterThan(1440);
  });
});

describe('componerItinerarios: franja horaria', () => {
  const datos = { horarios: horariosEscala(445), paradas: paradasEscala(445) };

  it('excluye los itinerarios que salen antes de franjaDesdeMin', () => {
    expect(componerItinerarios(opciones({ ...datos, franjaDesdeMin: 400 }))).toEqual([]);
  });

  it('excluye los itinerarios que llegan después de franjaHastaMin', () => {
    expect(componerItinerarios(opciones({ ...datos, franjaHastaMin: 500 }))).toEqual([]);
  });

  it('deja pasar lo que cae dentro de la franja', () => {
    const res = componerItinerarios(
      opciones({
        horarios: [h('TD', '04201', 375, 525, ORIGEN, DESTINO), ...datos.horarios],
        paradas: datos.paradas,
        franjaDesdeMin: 360,
        franjaHastaMin: 540,
      }),
    );

    expect(res.map((i) => i.tipo)).toEqual(['directo', 'escala']);
    expect(res.map((i) => i.llegadaTotalMin)).toEqual([525, 540]);
  });
});
