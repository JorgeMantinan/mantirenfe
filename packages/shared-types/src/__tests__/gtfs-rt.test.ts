import { describe, expect, it } from 'vitest';
import { parsearCancelados, parsearRetrasos, prefijoTripId } from '../gtfs-rt';

describe('prefijoTripId', () => {
  it('quita la fecha final de los tripIds de Larga Distancia', () => {
    expect(prefijoTripId('1309512026-09-23')).toBe('130951');
    expect(prefijoTripId('0419322026-09-24')).toBe('041932');
  });

  it('deja intactos los tripIds de Cercanías', () => {
    expect(prefijoTripId('3065J23574C1')).toBe('3065J23574C1');
    expect(prefijoTripId('2026-09-24')).toBe('2026-09-24');
  });
});

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

  it('normaliza los tripIds de Larga Distancia quitando la fecha', () => {
    const feed = {
      entity: [
        { tripUpdate: { trip: { tripId: '1309512026-09-23' }, delay: 300 } },
        { tripUpdate: { trip: { tripId: '0419322026-09-24' }, delay: 1440 } },
      ],
    };
    const retrasos = parsearRetrasos(feed);
    expect(retrasos.get('130951')).toBe(300);
    expect(retrasos.get('041932')).toBe(1440);
  });

  it('cruza los tripIds de Larga Distancia con numeroTren de 5 dígitos', () => {
    const feed = {
      entity: [
        { tripUpdate: { trip: { tripId: '1309512026-09-23' }, delay: 300 } },
        { tripUpdate: { trip: { tripId: '0419322026-09-24' }, delay: 1440 } },
        { tripUpdate: { trip: { tripId: '9999912026-09-24' }, delay: 60 } },
      ],
    };
    const retrasos = parsearRetrasos(feed, new Set(['13095', '04193']));
    expect([...retrasos.entries()]).toEqual([
      ['13095', 300],
      ['04193', 1440],
    ]);
  });
});

describe('parsearCancelados', () => {
  it('recoge los trips con scheduleRelationship CANCELED del feed real de LD', () => {
    const feed = {
      entity: [
        {
          id: 'TUCANCEL_1564812026-09-23',
          tripUpdate: { trip: { tripId: '1564812026-09-23', scheduleRelationship: 'CANCELED' } },
        },
        {
          id: 'TUUPDATE_1454612026-09-23',
          tripUpdate: {
            trip: { tripId: '1454612026-09-23', scheduleRelationship: 'SCHEDULED' },
            delay: 360,
          },
        },
      ],
    };
    expect([...parsearCancelados(feed)]).toEqual(['156481']);
  });

  it('filtra por los tripIds indicados cruzando con numeroTren', () => {
    const feed = {
      entity: [
        { tripUpdate: { trip: { tripId: '1564812026-09-23', scheduleRelationship: 'CANCELED' } } },
        { tripUpdate: { trip: { tripId: '1564802026-09-23', scheduleRelationship: 'CANCELED' } } },
        { tripUpdate: { trip: { tripId: '9999912026-09-23', scheduleRelationship: 'CANCELED' } } },
      ],
    };
    expect([...parsearCancelados(feed, new Set(['15648']))]).toEqual(['15648']);
    expect(parsearCancelados(feed, new Set(['3065J23574C1'])).size).toBe(0);
  });

  it('sin filtro conserva el tripId de Cercanías tal cual', () => {
    const feed = {
      entity: [
        { tripUpdate: { trip: { tripId: '3065J23574C1', scheduleRelationship: 'CANCELED' } } },
      ],
    };
    expect([...parsearCancelados(feed)]).toEqual(['3065J23574C1']);
  });

  it('devuelve un set vacío ante un feed inválido o sin cancelaciones', () => {
    expect(parsearCancelados(null).size).toBe(0);
    expect(parsearCancelados({}).size).toBe(0);
    expect(parsearCancelados({ entity: 'no' }).size).toBe(0);
    expect(parsearCancelados({ entity: [{ tripUpdate: { trip: { tripId: 'a' } } }] }).size).toBe(0);
    expect(
      parsearCancelados({
        entity: [{ tripUpdate: { trip: { tripId: 'a', scheduleRelationship: 'NO_DATA' } } }],
      }).size,
    ).toBe(0);
  });

  it('ignora las entidades CANCELED sin tripId', () => {
    const feed = { entity: [{ tripUpdate: { trip: { scheduleRelationship: 'CANCELED' } } }] };
    expect(parsearCancelados(feed).size).toBe(0);
  });
});
