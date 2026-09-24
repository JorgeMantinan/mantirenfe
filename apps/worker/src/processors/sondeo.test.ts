import { describe, expect, it } from 'vitest';
import { serializarEstadoParaDiff } from './sondeo.test-helpers';

describe('diff de disponibilidad', () => {
  it('detecta un tren que pasa de no disponible a disponible', () => {
    const anterior = serializarEstadoParaDiff([
      { trenId: 't1', disponible: false },
      { trenId: 't2', disponible: true },
    ]);
    const actual = serializarEstadoParaDiff([
      { trenId: 't1', disponible: true },
      { trenId: 't2', disponible: true },
    ]);

    const antes = new Map(anterior.map((t) => [t.trenId, t.disponible]));
    const aparecen = actual.filter((t) => antes.get(t.trenId) === false && t.disponible);

    expect(aparecen.map((t) => t.trenId)).toEqual(['t1']);
  });
});
