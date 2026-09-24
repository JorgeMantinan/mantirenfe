import { describe, expect, it } from 'vitest';
import { aplicarRetrasos, type PosicionCruda } from './retrasos';

const posicion = (sobrantes: Partial<PosicionCruda>): PosicionCruda => ({
  id: 'VP_1',
  numeroTren: 'C1-23573',
  latitud: 37.5,
  longitud: -5.6,
  velocidadKmh: 80,
  tripId: null,
  ...sobrantes,
});

describe('aplicarRetrasos', () => {
  it('rellena retrasoSeg por tripId', () => {
    const retrasos = new Map([
      ['3065J23573C1', 480],
      ['3065J23574C1', 0],
    ]);
    const salida = aplicarRetrasos(
      [
        posicion({ id: 'a', tripId: '3065J23573C1' }),
        posicion({ id: 'b', tripId: '3065J23574C1' }),
        posicion({ id: 'c', tripId: 'sin-datos' }),
        posicion({ id: 'd', tripId: null }),
      ],
      retrasos,
      '2026-09-24T12:00:00.000Z',
    );

    expect(salida.map((p) => p.retrasoSeg)).toEqual([480, 0, null, null]);
    expect(salida.every((p) => p.actualizadaEn === '2026-09-24T12:00:00.000Z')).toBe(true);
    expect(salida.every((p) => !('tripId' in p))).toBe(true);
  });

  it('funciona sin información de retrasos', () => {
    const salida = aplicarRetrasos(
      [posicion({ tripId: 'x' })],
      new Map(),
      '2026-09-24T12:00:00.000Z',
    );
    expect(salida[0]?.retrasoSeg).toBeNull();
  });

  it('cruza los tripIds de Larga Distancia con la fecha quitada', () => {
    const retrasos = new Map([
      ['130951', 300],
      ['041932', 1440],
    ]);
    const salida = aplicarRetrasos(
      [
        posicion({ id: 'ld1', numeroTren: '13095', tripId: '1309512026-09-24' }),
        posicion({ id: 'ld2', numeroTren: '04193', tripId: '0419322026-09-24' }),
        posicion({ id: 'ld3', numeroTren: '00001', tripId: '0000112026-09-24' }),
      ],
      retrasos,
      '2026-09-24T12:00:00.000Z',
    );
    expect(salida.map((p) => p.retrasoSeg)).toEqual([300, 1440, null]);
  });

  it('deduplica vehículos repetidos manteniendo el último', () => {
    const salida = aplicarRetrasos(
      [
        posicion({ id: 'dup', numeroTren: '04193', tripId: '0419322026-09-24' }),
        posicion({ id: 'dup', numeroTren: '04193', tripId: '0419312026-09-24' }),
      ],
      new Map([['041931', 900]]),
      '2026-09-24T12:00:00.000Z',
    );
    expect(salida).toHaveLength(1);
    expect(salida[0]?.retrasoSeg).toBe(900);
  });
});
