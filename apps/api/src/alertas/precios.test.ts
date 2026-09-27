import { describe, expect, it } from 'vitest';
import { formatearPuntosPrecio, type FilaPrecio } from './precios';

function fila(minutos: number, extra: Partial<FilaPrecio> = {}): FilaPrecio {
  return {
    numeroTren: '03311',
    salida: '08:00',
    precioMin: 45,
    disponible: true,
    registradoEn: new Date(Date.UTC(2026, 8, 1, 10, minutos)),
    ...extra,
  };
}

describe('formatearPuntosPrecio', () => {
  it('devuelve los puntos en orden cronológico ascendente', () => {
    const puntos = formatearPuntosPrecio([fila(30), fila(20), fila(10)]);
    expect(puntos.map((p) => p.registradoEn)).toEqual([
      '2026-09-01T10:10:00.000Z',
      '2026-09-01T10:20:00.000Z',
      '2026-09-01T10:30:00.000Z',
    ]);
  });

  it('no muta las filas originales y conserva precio/disponibilidad', () => {
    const filas = [fila(20, { precioMin: 40, disponible: false }), fila(10, { precioMin: null })];
    const puntos = formatearPuntosPrecio(filas);
    expect(filas[0]?.registradoEn.getMinutes()).toBe(20);
    expect(puntos[0]).toEqual({
      numeroTren: '03311',
      salida: '08:00',
      precioMin: null,
      disponible: true,
      registradoEn: '2026-09-01T10:10:00.000Z',
    });
    expect(puntos[1]?.precioMin).toBe(40);
    expect(puntos[1]?.disponible).toBe(false);
  });

  it('devuelve una lista vacía cuando aún no hay histórico', () => {
    expect(formatearPuntosPrecio([])).toEqual([]);
  });
});
