import { describe, expect, it } from 'vitest';
import type { PuntoPrecio } from '@mantirenfe/shared-types';
import { agruparPrecios, anchoBarra, consejoPrecio, formatearPrecio } from './precios';

function punto(minutos: number, extra: Partial<PuntoPrecio> = {}): PuntoPrecio {
  return {
    numeroTren: '03311',
    salida: '08:00',
    precioMin: 45,
    disponible: true,
    registradoEn: new Date(Date.UTC(2026, 8, 1, 8, minutos)).toISOString(),
    ...extra,
  };
}

describe('agruparPrecios', () => {
  it('agrupa por numeroTren + salida y calcula min/max', () => {
    const series = agruparPrecios([
      punto(0, { precioMin: 45 }),
      punto(10, { precioMin: 40 }),
      punto(20, { salida: '10:00', precioMin: 60 }),
      punto(30, { numeroTren: '03312', precioMin: 30 }),
    ]);
    expect(series).toHaveLength(3);
    expect(series[0]?.clave).toBe('03311|08:00');
    expect(series[0]?.puntos).toHaveLength(2);
    expect(series[0]?.minimo).toBe(40);
    expect(series[0]?.maximo).toBe(45);
  });

  it('ignora los puntos sin precio para el rango', () => {
    const series = agruparPrecios([punto(0, { precioMin: null }), punto(10, { precioMin: 50 })]);
    expect(series[0]?.minimo).toBe(50);
    expect(series[0]?.maximo).toBe(50);
    expect(series[0]?.puntos).toHaveLength(2);
  });

  it('devuelve vacío sin puntos', () => {
    expect(agruparPrecios([])).toEqual([]);
  });
});

describe('anchoBarra', () => {
  it('es proporcional al rango min→max del tren', () => {
    expect(anchoBarra(45, 40, 50)).toBe(50);
    expect(anchoBarra(50, 40, 50)).toBe(100);
    expect(anchoBarra(40, 40, 50)).toBe(8);
  });

  it('pinta el 100% cuando todos los precios son iguales', () => {
    expect(anchoBarra(45, 45, 45)).toBe(100);
  });

  it('sin precio no dibuja barra', () => {
    expect(anchoBarra(null, 40, 50)).toBe(0);
    expect(anchoBarra(45, null, null)).toBe(0);
  });
});

describe('consejoPrecio', () => {
  it('avisa de que ha bajado desde un precio anterior', () => {
    const consejo = consejoPrecio([
      punto(0, { precioMin: 45 }),
      punto(10, { precioMin: 42 }),
      punto(20, { precioMin: 38 }),
    ]);
    expect(consejo).toBe(`El precio ha bajado desde ${formatearPrecio(45)} → buen momento`);
  });

  it('indica el mínimo histórico cuando el precio sube', () => {
    const consejo = consejoPrecio([
      punto(0, { precioMin: 35 }),
      punto(10, { precioMin: 40 }),
      punto(20, { precioMin: 44 }),
    ]);
    expect(consejo).toContain('Sube:');
    expect(consejo).toContain(formatearPrecio(35));
  });

  it('sin movimiento repite que no hay cambios', () => {
    expect(consejoPrecio([punto(0), punto(10), punto(20)])).toBe('Sin cambios en 24 h');
  });

  it('sin precios registrados lo dice', () => {
    expect(consejoPrecio([])).toBe('Sin datos de precio todavía');
    expect(consejoPrecio([punto(0, { precioMin: null })])).toBe('Sin datos de precio todavía');
  });
});

describe('formatearPrecio', () => {
  it('formatea en euros o muestra una raya', () => {
    expect(formatearPrecio(null)).toBe('—');
    expect(formatearPrecio(45)).toContain('45');
  });
});
