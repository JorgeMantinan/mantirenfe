import { describe, expect, it } from 'vitest';
import type { PosicionTrenResponse } from '@mantirenfe/shared-types';
import { enriquecerPosiciones, type HorarioActivo } from './enriquecer';

const posicion = (sobrantes: Partial<PosicionTrenResponse>): PosicionTrenResponse => ({
  id: 'p1',
  numeroTren: '03311',
  latitud: 40.4,
  longitud: -3.7,
  velocidadKmh: 120,
  retrasoSeg: 300,
  actualizadaEn: '2026-09-25T12:00:00.000Z',
  ...sobrantes,
});

const horario = (sobrantes: Partial<HorarioActivo>): HorarioActivo => ({
  numeroTren: '03311',
  origenNombre: 'Madrid-Atocha',
  destinoNombre: 'Barcelona-Sants',
  salida: new Date('2026-09-25T09:00:00Z'),
  llegada: new Date('2026-09-25T12:30:00Z'),
  operador: 'AVE',
  ...sobrantes,
});

const ahora = new Date('2026-09-25T11:00:00Z');

describe('enriquecerPosiciones', () => {
  it('añade el trayecto del tren que está en vuelo', () => {
    const salida = enriquecerPosiciones(
      [posicion({})],
      [
        horario({}), // 09:00 → 12:30 (en vuelo a las 11:00)
        horario({
          numeroTren: '03311',
          salida: new Date('2026-09-25T17:00:00Z'),
          llegada: new Date('2026-09-25T20:30:00Z'),
        }),
      ],
      ahora,
    );
    expect(salida[0]?.origenNombre).toBe('Madrid-Atocha');
    expect(salida[0]?.destinoNombre).toBe('Barcelona-Sants');
    expect(salida[0]?.salida).toBe('2026-09-25T09:00:00.000Z');
    expect(salida[0]?.llegada).toBe('2026-09-25T12:30:00.000Z');
    expect(salida[0]?.operador).toBe('AVE');
  });

  it('si ninguno está en ventana, elige la salida más cercana a ahora', () => {
    const salida = enriquecerPosiciones(
      [posicion({})],
      [
        horario({
          salida: new Date('2026-09-24T18:00:00Z'),
          llegada: new Date('2026-09-24T21:30:00Z'),
        }),
        horario({
          salida: new Date('2026-09-25T17:00:00Z'),
          llegada: new Date('2026-09-25T20:30:00Z'),
        }),
      ],
      ahora,
    );
    // hoy17:00 está a6h de las11:00; la de ayer18:00, a17h
    expect(salida[0]?.salida).toBe('2026-09-25T17:00:00.000Z');
  });

  it('cruza también por tripId (Cercanías: label != trip)', () => {
    const salida = enriquecerPosiciones(
      [posicion({ numeroTren: 'C1-23560', tripId: '3009J23560C1' })],
      [horario({ numeroTren: '3009J23560C1' })],
      ahora,
    );
    expect(salida[0]?.origenNombre).toBe('Madrid-Atocha');
  });

  it('sin horarios o sin match, devuelve las posiciones tal cual', () => {
    const p = posicion({});
    expect(enriquecerPosiciones([p], [], ahora)).toEqual([p]);
    expect(
      enriquecerPosiciones([p], [horario({ numeroTren: '99999' })], ahora)[0]?.origenNombre,
    ).toBeUndefined();
  });
});
