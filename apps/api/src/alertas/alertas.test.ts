import { describe, expect, it } from 'vitest';
import { actualizaAlertaSchema, crearAlertaSchema } from '@mantirenfe/shared-types';

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

describe('actualizarAlertaSchema (edición)', () => {
  it('acepta cambiar la ruta, la fecha y el tren', () => {
    const resultado = actualizaAlertaSchema.safeParse({
      origenNombre: 'Madrid-Puerta de Atocha',
      destinoNombre: 'Barcelona-Sants',
      fechaViaje: '2026-10-05',
      numeroTren: '03311',
      horaDesde: '07:00',
      horaHasta: '21:00',
      notas: 'editada',
    });
    expect(resultado.success).toBe(true);
  });

  it('acepta cambios parciales (solo estado o solo notas)', () => {
    expect(actualizaAlertaSchema.safeParse({ estado: 'PAUSA' }).success).toBe(true);
    expect(actualizaAlertaSchema.safeParse({ notas: null }).success).toBe(true);
    expect(actualizaAlertaSchema.safeParse({ intervaloSondeoMin: 15 }).success).toBe(true);
  });

  it('rechaza fechas y horas inválidas', () => {
    expect(actualizaAlertaSchema.safeParse({ fechaViaje: 'mañana' }).success).toBe(false);
    expect(actualizaAlertaSchema.safeParse({ horaDesde: '25:99' }).success).toBe(false);
    expect(actualizaAlertaSchema.safeParse({ criterio: 'NINGUNO' }).success).toBe(false);
  });
});
