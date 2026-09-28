import { describe, expect, it } from 'vitest';
import { etiquetaBono, etiquetaEstado, validarAlerta } from './alertas';

describe('validarAlerta', () => {
  it('acepta una alerta válida', () => {
    const resultado = validarAlerta({
      origenNombre: 'Madrid-Chamartín',
      destinoNombre: 'Barcelona-Sants',
      fechaViaje: '2026-10-01',
      criterio: 'DISPONIBILIDAD',
      intervaloSondeoMin: 10,
      bono: 'GENERAL',
    });
    expect(resultado.success).toBe(true);
  });

  it('rechaza una fecha inválida', () => {
    const resultado = validarAlerta({
      origenNombre: 'Madrid',
      destinoNombre: 'Sevilla',
      fechaViaje: 'no-fecha',
      criterio: 'DISPONIBILIDAD',
      intervaloSondeoMin: 10,
      bono: 'GENERAL',
    });
    expect(resultado.success).toBe(false);
  });

  it('exige precioObjetivo con criterio PRECIO y lo ignora en el resto', () => {
    const base = {
      origenNombre: 'Madrid-Chamartín',
      destinoNombre: 'Barcelona-Sants',
      fechaViaje: '2026-10-01',
      intervaloSondeoMin: 10,
      bono: 'GENERAL',
    };
    expect(validarAlerta({ ...base, criterio: 'PRECIO' }).success).toBe(false);
    expect(validarAlerta({ ...base, criterio: 'PRECIO', precioObjetivo: 25 }).success).toBe(true);
    expect(validarAlerta({ ...base, criterio: 'PRECIO', precioObjetivo: 0 }).success).toBe(false);
    expect(validarAlerta({ ...base, criterio: 'DISPONIBILIDAD' }).success).toBe(true);
  });
});

describe('etiquetas', () => {
  it('mapea bonos conocidos', () => {
    expect(etiquetaBono('ESTUDIANTE')).toBe('Estudiante');
    expect(etiquetaBono('DESCONOCIDO')).toBe('DESCONOCIDO');
  });

  it('mapea estados de alerta', () => {
    expect(etiquetaEstado('ACTIVA')).toBe('Activa');
    expect(etiquetaEstado('PAUSA')).toBe('En pausa');
    expect(etiquetaEstado('COMPLETADA')).toBe('Completada');
  });
});
