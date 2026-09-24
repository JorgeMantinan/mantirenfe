import { describe, expect, it } from 'vitest';
import { crearAlertaSchema } from '../dto/alertas';
import { criterioDisponibilidadSchema } from '../dto/trenes';

describe('crearAlertaSchema', () => {
  it('acepta una alerta válida mínima', () => {
    const result = crearAlertaSchema.safeParse({
      origenNombre: 'Madrid-Atocha',
      destinoNombre: 'Barcelona-Sants',
      fechaViaje: '2026-10-01',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.criterio).toBe('DISPONIBILIDAD');
      expect(result.data.intervaloSondeoMin).toBe(10);
      expect(result.data.bono).toBe('GENERAL');
    }
  });

  it('rechaza estaciones vacías', () => {
    const result = crearAlertaSchema.safeParse({
      origenNombre: '',
      destinoNombre: 'Barcelona-Sants',
      fechaViaje: '2026-10-01',
    });
    expect(result.success).toBe(false);
  });

  it('rechaza un intervalo no permitido', () => {
    const result = crearAlertaSchema.safeParse({
      origenNombre: 'Madrid-Atocha',
      destinoNombre: 'Barcelona-Sants',
      fechaViaje: '2026-10-01',
      intervaloSondeoMin: 7,
    });
    expect(result.success).toBe(false);
  });

  it('rechaza una fecha con formato incorrecto', () => {
    const result = crearAlertaSchema.safeParse({
      origenNombre: 'Madrid-Atocha',
      destinoNombre: 'Barcelona-Sants',
      fechaViaje: '01/10/2026',
    });
    expect(result.success).toBe(false);
  });
});

describe('criterioDisponibilidadSchema', () => {
  it('valida horas en formato HH:MM', () => {
    const result = criterioDisponibilidadSchema.safeParse({
      origenNombre: 'Madrid-Atocha',
      destinoNombre: 'Sevilla-Santa Justa',
      fecha: '2026-10-01',
      horaDesde: '17:00',
      horaHasta: '19:00',
    });
    expect(result.success).toBe(true);
  });

  it('rechaza horas fuera de rango', () => {
    const result = criterioDisponibilidadSchema.safeParse({
      origenNombre: 'Madrid-Atocha',
      destinoNombre: 'Sevilla-Santa Justa',
      fecha: '2026-10-01',
      horaDesde: '25:00',
    });
    expect(result.success).toBe(false);
  });
});
