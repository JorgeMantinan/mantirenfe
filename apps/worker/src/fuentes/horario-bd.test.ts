import { describe, expect, it } from 'vitest';
import type { ConsultaDisponibilidad } from '@mantirenfe/shared-types';
import { construirEstadoHorario, type HorarioBd } from './horario-bd';

const consulta: ConsultaDisponibilidad = {
  origenNombre: 'Sevilla',
  destinoNombre: 'Córdoba',
  fecha: '2026-09-24',
};

describe('construirEstadoHorario', () => {
  it('devuelve los horarios de la BD con trenId = numeroTren (estable ante cambio de hora)', () => {
    const horarios: HorarioBd[] = [
      { numeroTren: '04247', salida: new Date('2026-09-24T06:00:00.000Z') },
      { numeroTren: '04251', salida: new Date('2026-09-24T07:30:00.000Z') },
    ];
    const estado = construirEstadoHorario(consulta, horarios);

    expect(estado.trenes.map((t) => t.trenId)).toEqual(['04247', '04251']);
    expect(estado.trenes.map((t) => t.salida)).toEqual([
      '2026-09-24T06:00:00.000Z',
      '2026-09-24T07:30:00.000Z',
    ]);
    expect(estado.trenes.every((t) => t.disponible)).toBe(true);
    expect(estado.trenes.every((t) => t.precioMin === null)).toBe(true);
    expect(estado.consulta.fecha).toBe('2026-09-24');
  });

  it('devuelve estado vacío sin horarios', () => {
    expect(construirEstadoHorario(consulta, []).trenes).toEqual([]);
  });
});
