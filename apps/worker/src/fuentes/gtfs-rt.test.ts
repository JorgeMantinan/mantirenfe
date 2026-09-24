import { describe, expect, it } from 'vitest';
import type { ConsultaDisponibilidad } from '@mantirenfe/shared-types';
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
});
