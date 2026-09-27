import { describe, expect, it } from 'vitest';
import {
  ESCALA_CONSERVADORA,
  FUENTE_COMPROMISO_PUNTUALIDAD,
  funcionIndemnizacion,
  UMBRALES_INDENIZACION,
  UMBRAL_PRINCIPAL_INDENIZACION_SEG,
} from '../indemnizacion';

describe('umbrales documentados', () => {
  it('cita la fuente con fecha de consulta', () => {
    expect(FUENTE_COMPROMISO_PUNTUALIDAD.url).toContain('renfe.com');
    expect(FUENTE_COMPROMISO_PUNTUALIDAD.fechaConsulta).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('recoge las escalas principales de la página', () => {
    expect(UMBRALES_INDENIZACION.length).toBeGreaterThan(0);
    const comercial = UMBRALES_INDENIZACION.find((u) => u.servicio.startsWith('Servicios'));
    expect(comercial?.escalas).toEqual([
      { umbralSeg: 3600, umbralIncluyente: true, porcentaje: 50 },
      { umbralSeg: 5400, umbralIncluyente: false, porcentaje: 100 },
    ]);
    // El umbral principal conservador (mayor de entrada) es el de Servicios Comerciales
    const primeros = UMBRALES_INDENIZACION.map((u) => u.escalas[0]?.umbralSeg ?? 0);
    expect(UMBRAL_PRINCIPAL_INDENIZACION_SEG).toBe(Math.max(...primeros));
    expect(ESCALA_CONSERVADORA[0]?.umbralSeg).toBe(3600);
  });
});

describe('funcionIndemnizacion', () => {
  it('devuelve null por debajo del umbral', () => {
    expect(funcionIndemnizacion(0)).toBeNull();
    expect(funcionIndemnizacion(300)).toBeNull();
    expect(funcionIndemnizacion(30 * 60)).toBeNull();
    expect(funcionIndemnizacion(59 * 60)).toBeNull();
    expect(funcionIndemnizacion(-600)).toBeNull();
    expect(funcionIndemnizacion(Number.NaN)).toBeNull();
  });

  it('devuelve info justo en el umbral (60 min)', () => {
    const info = funcionIndemnizacion(60 * 60);
    expect(info).not.toBeNull();
    expect(info?.umbralSeg).toBe(3600);
    expect(info?.porcentaje).toBe(50);
    expect(info?.descripcion).toBe('retraso ≥ 60 min → 50% de devolución (según servicio)');
  });

  it('devuelve info con retrasos muy altos (100% a partir de >90 min)', () => {
    const info = funcionIndemnizacion(120 * 60);
    expect(info).not.toBeNull();
    expect(info?.umbralSeg).toBe(5400);
    expect(info?.porcentaje).toBe(100);
    expect(info?.descripcion).toBe('retraso > 90 min → 100% de devolución (según servicio)');

    expect(funcionIndemnizacion(91 * 60)?.porcentaje).toBe(100);
    expect(funcionIndemnizacion(90 * 60)?.porcentaje).toBe(50); // "superior a 90" no incluye 90
  });
});
