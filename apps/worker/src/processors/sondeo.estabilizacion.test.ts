import { describe, expect, it } from 'vitest';
import {
  diffDisponibles,
  estabilizarSerieVenta,
  SONDEOS_AGOTAR_PLAZA,
  type EstadoSerializado,
} from './sondeo';

const fila = (
  trenId: string,
  disponible: boolean,
  extra: Partial<EstadoSerializado> = {},
): EstadoSerializado =>
  ({ trenId, salida: '18:00', disponible, precioMin: 12, ...extra }) as EstadoSerializado;

describe('estabilizarSerieVenta', () => {
  it('un tren que la fuente deja de listar se conserva con su plaza (no re-avisa)', () => {
    const salida = estabilizarSerieVenta([fila('A-1', true)], []);
    expect(salida).toHaveLength(1);
    expect(salida[0].disponible).toBe(true);
  });

  it('un tren que la fuente marca como no disponible mantiene la plaza vista (no re-avisa)', () => {
    const salida = estabilizarSerieVenta([fila('A-1', true)], [fila('A-1', false)]);
    expect(salida).toHaveLength(1);
    expect(salida[0].disponible).toBe(true);
  });

  it('un tren NUEVO con plaza aparece tal cual (el diff lo avisará al instante)', () => {
    const salida = estabilizarSerieVenta([], [fila('B-2', true)]);
    expect(salida).toEqual([fila('B-2', true)]);
  });

  it('un tren que nunca tuvo plaza no se inventa', () => {
    const salida = estabilizarSerieVenta([fila('C-3', false)], [fila('C-3', false)]);
    expect(salida).toEqual([fila('C-3', false)]);
  });

  it('si la serie previa no tenía plaza y desaparece, no se recupera', () => {
    const salida = estabilizarSerieVenta([fila('D-4', false)], []);
    expect(salida).toHaveLength(0);
  });

  it('las filas de escala no se arrastran (las gestiona evaluarConexiones)', () => {
    const escala = { ...fila('escala|E-5', true), tramo: 'conexion' } as EstadoSerializado;
    const salida = estabilizarSerieVenta([escala], []);
    expect(salida).toHaveLength(0);
    // …pero las escala del actual pasan intactas
    expect(estabilizarSerieVenta([], [escala])).toEqual([escala]);
  });

  it('antes del umbral la plaza vista se conserva sin re-aviso (oscilación)', () => {
    let serie = estabilizarSerieVenta([], [fila('G-7', true)]);
    serie = estabilizarSerieVenta(serie, []); // 1.er sondeo sin plaza
    expect(serie[0].disponible).toBe(true);
    serie = estabilizarSerieVenta(serie, [fila('G-7', false)]); // 2.º, la fuente dice false
    expect(serie[0].disponible).toBe(true);
    // Vuelve con plaza ANTES del umbral: sigue siendo la misma plaza, no re-avisa
    const conPlaza = estabilizarSerieVenta(serie, [fila('G-7', true)]);
    expect(conPlaza[0].disponible).toBe(true);
    expect(diffDisponibles(serie, conPlaza).aparecen).toHaveLength(0);
  });

  it('tras el umbral de sondeos sin plaza queda agotado y el siguiente sí reavisa', () => {
    let serie = estabilizarSerieVenta([], [fila('H-8', true)]);
    for (let i = 0; i < SONDEOS_AGOTAR_PLAZA; i++) serie = estabilizarSerieVenta(serie, []);
    expect(serie).toHaveLength(1);
    expect(serie[0].disponible).toBe(false);
    // La fuente lo vuelve a listar con plaza: el diff ve false→true y reavisa
    const conPlaza = estabilizarSerieVenta(serie, [fila('H-8', true)]);
    expect(conPlaza[0].disponible).toBe(true);
    expect(diffDisponibles(serie, conPlaza).aparecen).toHaveLength(1);
  });
});
