import { describe, expect, it } from 'vitest';
import type { PosicionTrenResponse, PuntoTraza } from '@mantirenfe/shared-types';
import { incorporarPuntos } from './page';

function posicion(
  id: string,
  latitud: number,
  longitud: number,
  cuando = Date.now(),
): PosicionTrenResponse {
  return {
    id,
    numeroTren: `T-${id}`,
    latitud,
    longitud,
    velocidadKmh: 80,
    retrasoSeg: null,
    actualizadaEn: new Date(cuando).toISOString(),
  };
}

type Recorridos = Map<string, { puntos: PuntoTraza[]; visto: number }>;

/** Coordenadas [lat, lng] de un vehículo en el recorrido, o []. */
function latlngDe(recorridos: Recorridos, id: string): [number, number][] {
  return (recorridos.get(id)?.puntos ?? []).map((p) => [p.latitud, p.longitud]);
}

describe('incorporarPuntos (recorrido visto en el mapa)', () => {
  it('acumula un punto por tren y por refresco, con su fecha', () => {
    let recorridos = incorporarPuntos(new Map(), [posicion('A', 40.4, -3.7)]);
    recorridos = incorporarPuntos(recorridos, [posicion('A', 40.41, -3.71)]);

    expect(latlngDe(recorridos, 'A')).toEqual([
      [40.4, -3.7],
      [40.41, -3.71],
    ]);
    // Sin fecha no se podría cortar por huecos (rectas fantasma)
    expect(recorridos.get('A')?.puntos.every((p) => Number.isFinite(Date.parse(p.en)))).toBe(true);
  });

  it('no registra movimientos de milímetros (tren parado o ruido GPS)', () => {
    let recorridos = incorporarPuntos(new Map(), [posicion('A', 40.4, -3.7)]);
    // ~1 m de diferencia: por debajo del umbral de 0,0001º (~11 m)
    recorridos = incorporarPuntos(recorridos, [posicion('A', 40.400001, -3.700001)]);

    expect(latlngDe(recorridos, 'A')).toHaveLength(1);
  });

  it('recorta el recorrido a los últimos 90 puntos', () => {
    let recorridos = new Map();
    for (let i = 0; i < 200; i++) {
      recorridos = incorporarPuntos(recorridos, [posicion('A', 40 + i / 1000, -3.7)]);
    }
    expect(latlngDe(recorridos, 'A')).toHaveLength(90);
    // El primer punto guardado es el 111.º: se ha tirado lo más antiguo
    expect(latlngDe(recorridos, 'A')[0]?.[0]).toBeCloseTo(40.11, 3);
  });

  it('poda los vehículos que llevan más de 6 h sin verse', () => {
    const hace7h = Date.now() - 7 * 60 * 60_000;
    const viejo: Recorridos = new Map([
      [
        'A',
        {
          puntos: [
            { en: new Date(hace7h).toISOString(), latitud: 40.4, longitud: -3.7, retrasoSeg: null },
          ],
          visto: hace7h,
        },
      ],
    ]);
    const recorridos = incorporarPuntos(viejo, [posicion('B', 41, -1)]);

    expect(recorridos.has('A')).toBe(false);
    expect(recorridos.has('B')).toBe(true);
  });

  it('tira los puntos del vehículo que pasan de 6 h (no solo el vehículo)', () => {
    const hace7h = Date.now() - 7 * 60 * 60_000;
    const ahora = Date.now();
    const inicial: Recorridos = new Map([
      [
        'A',
        {
          puntos: [
            { en: new Date(hace7h).toISOString(), latitud: 40.1, longitud: -3.1, retrasoSeg: null },
            {
              en: new Date(ahora - 60_000).toISOString(),
              latitud: 40.4,
              longitud: -3.7,
              retrasoSeg: null,
            },
          ],
          visto: ahora,
        },
      ],
    ]);
    const recorridos = incorporarPuntos(inicial, [posicion('A', 40.41, -3.71)]);

    expect(latlngDe(recorridos, 'A')).toEqual([
      [40.4, -3.7],
      [40.41, -3.71],
    ]);
  });
});
