import { describe, expect, it } from 'vitest';
import type { EstadoDisponibilidad } from '@mantirenfe/shared-types';
import { diffDisponibles, diffHorarios, filtrarRetrasados, serializarEstado } from './sondeo';

function estado(trenes: EstadoDisponibilidad['trenes']): EstadoDisponibilidad {
  return {
    consulta: {
      origenNombre: 'Madrid',
      destinoNombre: 'Sevilla',
      fecha: '2026-10-01',
    },
    trenes,
    consultadoEn: new Date().toISOString(),
  };
}

describe('serializarEstado', () => {
  it('ordena por trenId e incluye retraso', () => {
    const serie = serializarEstado(
      estado([
        {
          trenId: 'b',
          numeroTren: '2',
          salida: '10:00',
          disponible: true,
          precioMin: 20,
          moneda: 'EUR',
          retrasoSeg: 600,
        },
        {
          trenId: 'a',
          numeroTren: '1',
          salida: '08:00',
          disponible: false,
          precioMin: null,
          moneda: 'EUR',
        },
      ]),
    );
    expect(serie.map((t) => t.trenId)).toEqual(['a', 'b']);
    expect(serie[1]?.retrasoSeg).toBe(600);
    expect(serie[0]?.retrasoSeg).toBeNull();
  });
});

describe('diffDisponibles', () => {
  it('detecta un tren que pasa de no disponible a disponible', () => {
    const anterior = serializarEstado(
      estado([
        {
          trenId: 't1',
          numeroTren: '1',
          salida: '08:00',
          disponible: false,
          precioMin: null,
          moneda: 'EUR',
        },
        {
          trenId: 't2',
          numeroTren: '2',
          salida: '10:00',
          disponible: true,
          precioMin: 15,
          moneda: 'EUR',
        },
      ]),
    );
    const actual = serializarEstado(
      estado([
        {
          trenId: 't1',
          numeroTren: '1',
          salida: '08:00',
          disponible: true,
          precioMin: 15,
          moneda: 'EUR',
        },
        {
          trenId: 't2',
          numeroTren: '2',
          salida: '10:00',
          disponible: true,
          precioMin: 15,
          moneda: 'EUR',
        },
      ]),
    );

    const { aparecen } = diffDisponibles(anterior, actual);
    expect(aparecen.map((t) => t.trenId)).toEqual(['t1']);
  });
});

describe('diffHorarios', () => {
  it('detecta salidas nuevas, retiradas y horas cambiadas', () => {
    const anterior = serializarEstado(
      estado([
        {
          trenId: 't1',
          numeroTren: '1',
          salida: '08:00',
          disponible: true,
          precioMin: null,
          moneda: 'EUR',
        },
        {
          trenId: 't2',
          numeroTren: '2',
          salida: '10:00',
          disponible: true,
          precioMin: null,
          moneda: 'EUR',
        },
      ]),
    );
    const actual = serializarEstado(
      estado([
        {
          trenId: 't1',
          numeroTren: '1',
          salida: '08:15',
          disponible: true,
          precioMin: null,
          moneda: 'EUR',
        },
        {
          trenId: 't3',
          numeroTren: '3',
          salida: '12:00',
          disponible: true,
          precioMin: null,
          moneda: 'EUR',
        },
      ]),
    );

    const { nuevos, salidos, cambiados } = diffHorarios(anterior, actual);
    expect(nuevos.map((t) => t.trenId)).toEqual(['t3']);
    expect(salidos.map((t) => t.trenId)).toEqual(['t2']);
    expect(cambiados.map((t) => t.trenId)).toEqual(['t1']);
  });
});

describe('filtrarRetrasados', () => {
  it('solo devuelve trenes sobre el umbral', () => {
    const actual = serializarEstado(
      estado([
        {
          trenId: 't1',
          numeroTren: '1',
          salida: '08:00',
          disponible: true,
          precioMin: null,
          moneda: 'EUR',
          retrasoSeg: 600,
        },
        {
          trenId: 't2',
          numeroTren: '2',
          salida: '09:00',
          disponible: true,
          precioMin: null,
          moneda: 'EUR',
          retrasoSeg: 60,
        },
        {
          trenId: 't3',
          numeroTren: '3',
          salida: '10:00',
          disponible: true,
          precioMin: null,
          moneda: 'EUR',
        },
      ]),
    );
    expect(filtrarRetrasados(actual, 300).map((t) => t.trenId)).toEqual(['t1']);
  });
});
