import { describe, expect, it } from 'vitest';
import { crearAlertaSchema, actualizarAlertaSchema, criterioAlertaSchema } from '../dto/alertas';
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

describe('crearAlertaSchema (trayecto cotidiano)', () => {
  it('recurrente y soloLaborables son opcionales y false por defecto', () => {
    const result = crearAlertaSchema.safeParse({
      origenNombre: 'Madrid-Atocha',
      destinoNombre: 'Barcelona-Sants',
      fechaViaje: '2026-10-01',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.recurrente).toBe(false);
      expect(result.data.soloLaborables).toBe(false);
    }
  });

  it('acepta una alerta recurrente de lunes a viernes', () => {
    const result = crearAlertaSchema.safeParse({
      origenNombre: 'Madrid-Atocha',
      destinoNombre: 'Barcelona-Sants',
      fechaViaje: '2026-10-01',
      recurrente: true,
      soloLaborables: true,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.recurrente).toBe(true);
      expect(result.data.soloLaborables).toBe(true);
    }
  });

  it('rechaza valores que no son booleanos', () => {
    const result = crearAlertaSchema.safeParse({
      origenNombre: 'Madrid-Atocha',
      destinoNombre: 'Barcelona-Sants',
      fechaViaje: '2026-10-01',
      recurrente: 'si',
    });
    expect(result.success).toBe(false);
  });
});

describe('actualizarAlertaSchema (trayecto cotidiano)', () => {
  it('acepta cambiar la frecuencia por completo o por partes', () => {
    expect(
      actualizarAlertaSchema.safeParse({ recurrente: true, soloLaborables: true }).success,
    ).toBe(true);
    expect(actualizarAlertaSchema.safeParse({ recurrente: false }).success).toBe(true);
    expect(actualizarAlertaSchema.safeParse({ soloLaborables: true }).success).toBe(true);
    expect(actualizarAlertaSchema.safeParse({ recurrente: 1 }).success).toBe(false);
  });
});

describe('crearAlertaSchema (criterio PRECIO)', () => {
  const base = {
    origenNombre: 'Madrid-Atocha',
    destinoNombre: 'Barcelona-Sants',
    fechaViaje: '2026-10-01',
  };

  it('exige precioObjetivo cuando el criterio es PRECIO', () => {
    const result = crearAlertaSchema.safeParse({ ...base, criterio: 'PRECIO' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('precioObjetivo'))).toBe(true);
    }
  });

  it('acepta el umbral con criterio PRECIO', () => {
    const result = crearAlertaSchema.safeParse({
      ...base,
      criterio: 'PRECIO',
      precioObjetivo: 30,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.criterio).toBe('PRECIO');
      expect(result.data.precioObjetivo).toBe(30);
    }
  });

  it('rechaza un precioObjetivo que no sea un número positivo', () => {
    expect(
      crearAlertaSchema.safeParse({ ...base, criterio: 'PRECIO', precioObjetivo: 0 }).success,
    ).toBe(false);
    expect(
      crearAlertaSchema.safeParse({ ...base, criterio: 'PRECIO', precioObjetivo: -5 }).success,
    ).toBe(false);
    expect(
      crearAlertaSchema.safeParse({ ...base, criterio: 'PRECIO', precioObjetivo: '30' }).success,
    ).toBe(false);
  });

  it('no exige precioObjetivo en el resto de criterios', () => {
    expect(crearAlertaSchema.safeParse(base).success).toBe(true);
    const conUmbralIgnorado = crearAlertaSchema.safeParse({
      ...base,
      criterio: 'DISPONIBILIDAD',
      precioObjetivo: 40,
    });
    expect(conUmbralIgnorado.success).toBe(true);
  });

  it('acepta el nuevo criterio en la lista de criterios', () => {
    expect(criterioAlertaSchema.safeParse('PRECIO').success).toBe(true);
  });
});

describe('actualizarAlertaSchema (criterio PRECIO)', () => {
  it('acepta entrar en PRECIO con objetivo y rechazarlo sin objetivo', () => {
    expect(
      actualizarAlertaSchema.safeParse({ criterio: 'PRECIO', precioObjetivo: 25 }).success,
    ).toBe(true);
    expect(actualizarAlertaSchema.safeParse({ criterio: 'PRECIO' }).success).toBe(false);
  });

  it('acepta parches que no tocan el criterio ni el umbral', () => {
    expect(actualizarAlertaSchema.safeParse({ estado: 'PAUSA' }).success).toBe(true);
    expect(actualizarAlertaSchema.safeParse({ notas: null }).success).toBe(true);
    expect(actualizarAlertaSchema.safeParse({ precioObjetivo: 25 }).success).toBe(true);
  });

  it('rechaza un precioObjetivo no positivo', () => {
    expect(actualizarAlertaSchema.safeParse({ precioObjetivo: 0 }).success).toBe(false);
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
