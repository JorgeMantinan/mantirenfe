import { describe, expect, it } from 'vitest';
import { crearAlertaSchema } from '@mantirenfe/shared-types';

describe('API (schemas compartidos)', () => {
  it('el esquema de alertas es el mismo que usa la web', () => {
    const resultado = crearAlertaSchema.safeParse({
      origenNombre: 'Madrid-Atocha',
      destinoNombre: 'Valencia-Joaquín Sorolla',
      fechaViaje: '2026-11-15',
      horaDesde: '08:00',
      criterio: 'DISPONIBILIDAD',
    });
    expect(resultado.success).toBe(true);
  });
});
