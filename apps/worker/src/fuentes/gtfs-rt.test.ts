import { describe, expect, it } from 'vitest';
import {
  parsearCancelados,
  parsearParadasSuprimidas,
  parsearRetrasos,
  type ConsultaDisponibilidad,
} from '@mantirenfe/shared-types';
import { construirEstadoRetrasos, paradasSuprimidasDeLaRuta, type HorarioRetraso } from './gtfs-rt';

const consulta: ConsultaDisponibilidad = {
  origenNombre: 'Sevilla',
  destinoNombre: 'Córdoba',
  fecha: '2026-09-24',
};

const horarios: HorarioRetraso[] = [
  { numeroTren: '3065J23574C1', salida: new Date('2026-09-24T06:10:00.000Z') },
  { numeroTren: '3065J23573C1', salida: new Date('2026-09-24T06:40:00.000Z') },
  { numeroTren: '3065J23575C1', salida: new Date('2026-09-24T07:10:00.000Z') },
];

describe('construirEstadoRetrasos', () => {
  it('asigna el retraso por tripId y deja null sin datos', () => {
    const retrasos = new Map([
      ['3065J23573C1', 480],
      ['3065J23574C1', 0],
    ]);
    const estado = construirEstadoRetrasos(consulta, horarios, retrasos);

    expect(estado.consulta.fecha).toBe('2026-09-24');
    expect(estado.trenes.map((t) => t.trenId)).toEqual([
      '3065J23574C1',
      '3065J23573C1',
      '3065J23575C1',
    ]);
    expect(estado.trenes.map((t) => t.retrasoSeg)).toEqual([0, 480, null]);
    expect(estado.trenes.every((t) => t.disponible)).toBe(true);
  });

  it('devuelve estado vacío sin horarios', () => {
    expect(construirEstadoRetrasos(consulta, [], new Map()).trenes).toEqual([]);
  });

  it('cruza el feed de Larga Distancia con numeroTren de la BD', () => {
    const feedLd = {
      entity: [
        { tripUpdate: { trip: { tripId: '1309512026-09-24' }, delay: 300 } },
        { tripUpdate: { trip: { tripId: '0419322026-09-24' }, delay: 1440 } },
        { tripUpdate: { trip: { tripId: '8888812026-09-24' }, delay: 600 } },
      ],
    };
    const horariosLd: HorarioRetraso[] = [
      { numeroTren: '13095', salida: new Date('2026-09-24T09:00:00.000Z') },
      { numeroTren: '04193', salida: new Date('2026-09-24T10:00:00.000Z') },
    ];
    const tripIds = new Set(horariosLd.map((h) => h.numeroTren));
    const estado = construirEstadoRetrasos(consulta, horariosLd, parsearRetrasos(feedLd, tripIds));

    expect(estado.trenes.map((t) => t.retrasoSeg)).toEqual([300, 1440]);
  });

  it('marca cancelado los trenes cuyo trip está CANCELED en el feed', () => {
    const feedLd = {
      entity: [
        {
          id: 'TUCANCEL_1309512026-09-24',
          tripUpdate: { trip: { tripId: '1309512026-09-24', scheduleRelationship: 'CANCELED' } },
        },
        {
          tripUpdate: {
            trip: { tripId: '0419322026-09-24', scheduleRelationship: 'SCHEDULED' },
            delay: 600,
          },
        },
      ],
    };
    const horariosLd: HorarioRetraso[] = [
      { numeroTren: '13095', salida: new Date('2026-09-24T09:00:00.000Z') },
      { numeroTren: '04193', salida: new Date('2026-09-24T10:00:00.000Z') },
      { numeroTren: '04786', salida: new Date('2026-09-24T11:00:00.000Z') },
    ];
    const tripIds = new Set(horariosLd.map((h) => h.numeroTren));
    const estado = construirEstadoRetrasos(
      consulta,
      horariosLd,
      parsearRetrasos(feedLd, tripIds),
      parsearCancelados(feedLd, tripIds),
    );

    expect(estado.trenes.map((t) => t.cancelado)).toEqual([true, false, false]);
    expect(estado.trenes[0]?.retrasoSeg).toBeNull();
  });

  it('sin datos de cancelación deja todos los trenes en false', () => {
    const estado = construirEstadoRetrasos(consulta, horarios, new Map([['3065J23573C1', 480]]));
    expect(estado.trenes.map((t) => t.cancelado)).toEqual([false, false, false]);
  });

  it('marca las paradas suprimidas del tren y no las deja vacías en el resto', () => {
    const estado = construirEstadoRetrasos(
      consulta,
      horarios,
      new Map([['3065J23574C1', 180]]),
      new Set(),
      new Map([['3065J23574C1', ['Córdoba']]]),
    );

    expect(estado.trenes[0]?.paradasSuprimidas).toEqual(['Córdoba']);
    expect(estado.trenes[1]?.paradasSuprimidas).toBeUndefined();
    expect(estado.trenes[2]?.paradasSuprimidas).toBeUndefined();
  });

  it('sin paradas suprimidas no añade el campo al estado', () => {
    const estado = construirEstadoRetrasos(consulta, horarios, new Map());
    expect(estado.trenes.every((t) => t.paradasSuprimidas === undefined)).toBe(true);
  });
});

describe('paradasSuprimidasDeLaRuta', () => {
  const estaciones = [
    { id: 'e-oviedo', codigo: '15211', nombre: 'Oviedo' },
    { id: 'e-gijon', codigo: '15410', nombre: 'Gijón-Sanz Crespo' },
    { id: 'e-aviles', codigo: '16403', nombre: 'Avilés' },
    { id: 'e-intermedia', codigo: '15400', nombre: 'Veriña' },
  ];
  const horarios: HorarioRetraso[] = [
    {
      numeroTren: '2068D22233C2',
      salida: new Date('2026-09-24T06:00:00.000Z'),
      origenEstacionId: 'e-oviedo',
      destinoEstacionId: 'e-gijon',
    },
    {
      numeroTren: '2068D70773C6',
      salida: new Date('2026-09-24T07:00:00.000Z'),
      origenEstacionId: 'e-aviles',
      destinoEstacionId: 'e-gijon',
    },
  ];

  it('cruza stopId (codigo GTFS) con el origen y el destino del tren', () => {
    const suprimidas = new Map([
      ['2068D22233C2', ['16011', '15410']],
      ['2068D70773C6', ['15400']],
    ]);
    const resueltas = paradasSuprimidasDeLaRuta(horarios, suprimidas, estaciones);

    expect([...resueltas]).toEqual([['2068D22233C2', ['Gijón-Sanz Crespo']]]);
  });

  it('ignora las paradas intermedias y los trenes sin supresión', () => {
    const suprimidas = new Map([
      ['2068D22233C2', ['15400']],
      ['2068D70773C6', ['15211']],
    ]);
    expect(paradasSuprimidasDeLaRuta(horarios, suprimidas, estaciones).size).toBe(0);
    expect(paradasSuprimidasDeLaRuta(horarios, new Map(), estaciones).size).toBe(0);
  });

  it('acumula origen y destino sin duplicar nombres', () => {
    const suprimidas = new Map([['2068D22233C2', ['15211', '15410']]]);
    const mismoOrigenYDestino: HorarioRetraso[] = [
      {
        numeroTren: '2068D22233C2',
        salida: new Date('2026-09-24T06:00:00.000Z'),
        origenEstacionId: 'e-oviedo',
        destinoEstacionId: 'e-oviedo',
      },
    ];
    const resueltas = paradasSuprimidasDeLaRuta(mismoOrigenYDestino, suprimidas, estaciones);
    expect(resueltas.get('2068D22233C2')).toEqual(['Oviedo']);
  });

  it('el feed real de Cercanías con SKIPPED produce paradas del tren', () => {
    const feed = {
      entity: [
        {
          tripUpdate: {
            trip: { tripId: '2068D70773C6', scheduleRelationship: 'SCHEDULED' },
            stopTimeUpdate: [
              { arrival: { delay: 2100, time: '1790542980' }, stopId: '05504' },
              { stopId: '15211', scheduleRelationship: 'SKIPPED' },
            ],
          },
        },
      ],
    };
    const horario: HorarioRetraso[] = [
      {
        numeroTren: '2068D70773C6',
        salida: new Date('2026-09-24T07:00:00.000Z'),
        origenEstacionId: 'e-oviedo',
        destinoEstacionId: 'e-gijon',
      },
    ];
    const suprimidas = new Map(parsearParadasSuprimidas(feed).map((p) => [p.tripId, p.stopIds]));
    const estado = construirEstadoRetrasos(
      consulta,
      horario,
      new Map(),
      new Set(),
      paradasSuprimidasDeLaRuta(horario, suprimidas, estaciones),
    );
    expect(estado.trenes[0]?.paradasSuprimidas).toEqual(['Oviedo']);
  });
});
