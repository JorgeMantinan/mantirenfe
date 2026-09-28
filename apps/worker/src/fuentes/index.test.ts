import { describe, expect, it } from 'vitest';
import { crearFuenteDatos } from './index';

describe('crearFuenteDatos (criterio PRECIO)', () => {
  it('PRECIO comparte la fuente de venta con DISPONIBILIDAD y APERTURA_VENTA', () => {
    expect(crearFuenteDatos('PRECIO').nombre).toBe(crearFuenteDatos('DISPONIBILIDAD').nombre);
    expect(crearFuenteDatos('PRECIO').nombre).toBe(crearFuenteDatos('APERTURA_VENTA').nombre);
  });

  it('PRECIO no cae en las fuentes de retraso ni de horario (sin precioMin)', () => {
    expect(crearFuenteDatos('PRECIO').nombre).not.toBe(crearFuenteDatos('RETRASO').nombre);
    expect(crearFuenteDatos('PRECIO').nombre).not.toBe(crearFuenteDatos('HORARIO').nombre);
  });
});
