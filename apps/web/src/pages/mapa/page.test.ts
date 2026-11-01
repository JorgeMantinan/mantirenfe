import { describe, expect, it } from 'vitest';
import type { PosicionTrenResponse } from '@mantirenfe/shared-types';
import { incorporarPuntos } from './page';

function posicion(id: string, latitud: number, longitud: number): PosicionTrenResponse {
  return {
    id,
    numeroTren: `T-${id}`,
    latitud,
    longitud,
    velocidadKmh: 80,
    retrasoSeg: null,
    actualizadaEn: new Date().toISOString(),
  };
}

/** Puntos de un vehículo en el recorrido, o 0 si no está. */
function puntosDe(
  recorridos: Map<string, { puntos: [number, number][]; visto: number }>,
  id: string,
) {
  return recorridos.get(id)?.puntos ?? [];
}

describe('incorporarPuntos (recorrido visto en el mapa)', () => {
  it('acumula un punto por tren y por refresco', () => {
    let recorridos = incorporarPuntos(new Map(), [posicion('A', 40.4, -3.7)]);
    recorridos = incorporarPuntos(recorridos, [posicion('A', 40.41, -3.71)]);

    expect(puntosDe(recorridos, 'A')).toEqual([
      [40.4, -3.7],
      [40.41, -3.71],
    ]);
  });

  it('no registra movimientos de milímetros (tren parado o ruido GPS)', () => {
    let recorridos = incorporarPuntos(new Map(), [posicion('A', 40.4, -3.7)]);
    // ~1 m de diferencia: por debajo del umbral de 0,0001º (~11 m)
    recorridos = incorporarPuntos(recorridos, [posicion('A', 40.400001, -3.700001)]);

    expect(puntosDe(recorridos, 'A')).toHaveLength(1);
  });

  it('recorta el recorrido a la última hora (120 puntos)', () => {
    let recorridos = new Map();
    for (let i = 0; i < 200; i++) {
      recorridos = incorporarPuntos(recorridos, [posicion('A', 40 + i / 1000, -3.7)]);
    }
    expect(puntosDe(recorridos, 'A')).toHaveLength(120);
    // El primer punto guardado es el 81.º: se ha tirado lo más antiguo
    expect(puntosDe(recorridos, 'A')[0]?.[0]).toBeCloseTo(40.08, 3);
  });

  it('poda los vehículos que llevan más de 6 h sin verse', () => {
    const viejo = new Map([
      ['A', { puntos: [[40.4, -3.7]] as [number, number][], visto: Date.now() - 7 * 60 * 60_000 }],
    ]);
    const recorridos = incorporarPuntos(viejo, [posicion('B', 41, -1)]);

    expect(recorridos.has('A')).toBe(false);
    expect(recorridos.has('B')).toBe(true);
  });
});
