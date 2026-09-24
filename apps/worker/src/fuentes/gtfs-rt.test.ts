import { describe, expect, it } from 'vitest';
import { parsearRetrasos, type ConsultaDisponibilidad } from '@mantirenfe/shared-types';
import { construirEstadoRetrasos, type HorarioRetraso } from './gtfs-rt';

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
});
