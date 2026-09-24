import { describe, expect, it } from 'vitest';
import { parsearRetrasos } from '../gtfs-rt';

describe('parsearRetrasos', () => {
  it('lee el delay del tripUpdate', () => {
    const feed = {
      entity: [
        {
          tripUpdate: {
            trip: { tripId: '3065J23574C1' },
            delay: 180,
            stopTimeUpdate: [{ arrival: { delay: 60 }, stopId: '50600' }],
          },
        },
      ],
    };
    const retrasos = parsearRetrasos(feed);
    expect(retrasos.get('3065J23574C1')).toBe(180);
  });

  it('usa el máximo de los delays de paradas si no hay delay general', () => {
    const feed = {
      entity: [
        {
          tripUpdate: {
            trip: { tripId: 'A' },
            stopTimeUpdate: [{ arrival: { delay: 60 } }, { departure: { delay: 240 } }],
          },
        },
      ],
    };
    expect(parsearRetrasos(feed).get('A')).toBe(240);
  });

  it('filtra por los tripIds indicados y omite los que no traen información', () => {
    const feed = {
      entity: [
        { tripUpdate: { trip: { tripId: 'A' }, delay: 60 } },
        { tripUpdate: { trip: { tripId: 'B' }, delay: 300 } },
        { tripUpdate: { trip: { tripId: 'C' } } },
        { tripUpdate: { trip: {} } },
      ],
    };
    const retrasos = parsearRetrasos(feed, new Set(['B', 'C']));
    expect([...retrasos.keys()]).toEqual(['B']);
    expect(retrasos.get('B')).toBe(300);
  });

  it('devuelve un mapa vacío ante un feed inválido', () => {
    expect(parsearRetrasos(null).size).toBe(0);
    expect(parsearRetrasos({}).size).toBe(0);
    expect(parsearRetrasos({ entity: 'no' }).size).toBe(0);
  });
});
