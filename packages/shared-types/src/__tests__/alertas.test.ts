import { describe, expect, it } from 'vitest';
import {
  crearAlertaSchema,
  actualizarAlertaSchema,
  criterioAlertaSchema,
  normalizarDiasSemana,
} from '../dto/alertas';
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

describe('crearAlertaSchema (conexiones / 1 escala)', () => {
  const base = {
    origenNombre: 'A Coruña',
    destinoNombre: 'Vigo',
    fechaViaje: '2026-10-05',
  };

  it('acepta el flag opcional y por defecto queda sin marcar', () => {
    const sinFlag = crearAlertaSchema.safeParse(base);
    expect(sinFlag.success).toBe(true);
    if (sinFlag.success) expect(sinFlag.data.conexiones).toBeUndefined();

    const marcado = crearAlertaSchema.safeParse({ ...base, conexiones: true });
    expect(marcado.success).toBe(true);
    if (marcado.success) expect(marcado.data.conexiones).toBe(true);
  });

  it('rechaza un valor que no sea booleano', () => {
    expect(crearAlertaSchema.safeParse({ ...base, conexiones: 'si' }).success).toBe(false);
    expect(crearAlertaSchema.safeParse({ ...base, conexiones: 1 }).success).toBe(false);
  });

  it('actualizarAlertaSchema admite el flag por partes', () => {
    expect(actualizarAlertaSchema.safeParse({ conexiones: true }).success).toBe(true);
    expect(actualizarAlertaSchema.safeParse({ conexiones: false }).success).toBe(true);
    expect(actualizarAlertaSchema.safeParse({ conexiones: 'no' }).success).toBe(false);
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

describe('crearAlertaSchema (criterios múltiples)', () => {
  const base = {
    origenNombre: 'Madrid-Atocha',
    destinoNombre: 'Barcelona-Sants',
    fechaViaje: '2026-10-01',
  };

  it('acepta la lista de criterios y también seguirla omitiendo (legado)', () => {
    const conLista = crearAlertaSchema.safeParse({
      ...base,
      criterios: ['RETRASO', 'DISPONIBILIDAD'],
    });
    expect(conLista.success).toBe(true);
    if (conLista.success) {
      expect(conLista.data.criterios).toEqual(['RETRASO', 'DISPONIBILIDAD']);
    }
    expect(crearAlertaSchema.safeParse(base).success).toBe(true);
  });

  it('exige al menos un criterio y como mucho cuatro', () => {
    expect(crearAlertaSchema.safeParse({ ...base, criterios: [] }).success).toBe(false);
    // Criterio desconocido: zod lo rechaza aunque el test lo pase como unknown
    expect(crearAlertaSchema.safeParse({ ...base, criterios: ['NINGUNO'] }).success).toBe(false);

    const cinco = crearAlertaSchema.safeParse({
      ...base,
      criterios: ['DISPONIBILIDAD', 'HORARIO', 'RETRASO', 'APERTURA_VENTA', 'DISPONIBILIDAD'],
    });
    expect(cinco.success).toBe(false);
    if (!cinco.success) {
      expect(cinco.error.issues.some((i) => i.path.includes('criterios'))).toBe(true);
    }

    expect(
      crearAlertaSchema.safeParse({
        ...base,
        criterios: ['DISPONIBILIDAD', 'HORARIO', 'RETRASO', 'APERTURA_VENTA'],
      }).success,
    ).toBe(true);
  });

  it('exige el umbral si PRECIO está en la lista, aunque criterio no lo sea', () => {
    const sinUmbral = crearAlertaSchema.safeParse({
      ...base,
      criterio: 'DISPONIBILIDAD',
      criterios: ['DISPONIBILIDAD', 'PRECIO'],
    });
    expect(sinUmbral.success).toBe(false);
    if (!sinUmbral.success) {
      expect(sinUmbral.error.issues.some((i) => i.path.includes('precioObjetivo'))).toBe(true);
    }

    const conUmbral = crearAlertaSchema.safeParse({
      ...base,
      criterio: 'DISPONIBILIDAD',
      criterios: ['DISPONIBILIDAD', 'PRECIO'],
      precioObjetivo: 32,
    });
    expect(conUmbral.success).toBe(true);
  });

  it('sin PRECIO en la lista no hace falta el umbral', () => {
    expect(
      crearAlertaSchema.safeParse({
        ...base,
        criterio: 'DISPONIBILIDAD',
        criterios: ['DISPONIBILIDAD', 'RETRASO'],
      }).success,
    ).toBe(true);
  });
});

describe('actualizarAlertaSchema (criterios múltiples)', () => {
  it('exige el umbral si el parche añade PRECIO a la lista', () => {
    expect(actualizarAlertaSchema.safeParse({ criterios: ['PRECIO'] }).success).toBe(false);
    expect(
      actualizarAlertaSchema.safeParse({ criterios: ['PRECIO'], precioObjetivo: 25 }).success,
    ).toBe(true);
    expect(actualizarAlertaSchema.safeParse({ criterios: ['DISPONIBILIDAD'] }).success).toBe(true);
    expect(
      actualizarAlertaSchema.safeParse({ criterios: ['DISPONIBILIDAD', 'RETRASO'] }).success,
    ).toBe(true);
  });

  it('rechaza listas vacías o con más de cuatro criterios', () => {
    expect(actualizarAlertaSchema.safeParse({ criterios: [] }).success).toBe(false);
    expect(
      actualizarAlertaSchema.safeParse({
        criterios: ['DISPONIBILIDAD', 'HORARIO', 'RETRASO', 'APERTURA_VENTA', 'PRECIO'],
      }).success,
    ).toBe(false);
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

const base = {
  origenNombre: 'Madrid-Atocha',
  destinoNombre: 'Barcelona-Sants',
  fechaViaje: '2026-10-01',
};

describe('crearAlertaSchema (días de la semana)', () => {
  it('diasSemana es opcional (vacío = todos los días)', () => {
    const result = crearAlertaSchema.safeParse({ ...base, recurrente: true });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.diasSemana).toBeUndefined();
  });

  it('acepta cualquier día de 0 (domingo) a 6 (sábado)', () => {
    for (const dias of [[0], [6], [1, 2, 3, 4, 5], [0, 1, 2, 3, 4, 5, 6], [4, 0]]) {
      const result = crearAlertaSchema.safeParse({ ...base, recurrente: true, diasSemana: dias });
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.diasSemana).toEqual(dias);
    }
  });

  it('rechaza días fuera de rango o no enteros', () => {
    for (const dias of [[7], [-1], [1.5], ['lunes']]) {
      expect(
        crearAlertaSchema.safeParse({ ...base, recurrente: true, diasSemana: dias }).success,
      ).toBe(false);
    }
  });

  it('rechaza más de 7 días', () => {
    const result = crearAlertaSchema.safeParse({
      ...base,
      recurrente: true,
      diasSemana: [0, 1, 2, 3, 4, 5, 6, 0],
    });
    expect(result.success).toBe(false);
  });

  it('acepta el legado soloLaborables junto al formato nuevo', () => {
    const result = crearAlertaSchema.safeParse({
      ...base,
      recurrente: true,
      soloLaborables: true,
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.soloLaborables).toBe(true);
  });
});

describe('crearAlertaSchema (cualquier fecha / rango flexible)', () => {
  it('acepta fechaFlexible sin rango (la API aplica hoy … hoy + 180)', () => {
    const result = crearAlertaSchema.safeParse({ ...base, fechaFlexible: true });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.fechaFlexible).toBe(true);
      expect(result.data.fechaDesde).toBeUndefined();
      expect(result.data.fechaHasta).toBeUndefined();
    }
  });

  it('acepta el rango concreto y lo valida', () => {
    const ok = crearAlertaSchema.safeParse({
      ...base,
      fechaFlexible: true,
      fechaDesde: '2026-10-05',
      fechaHasta: '2027-04-03',
    });
    expect(ok.success).toBe(true);

    const alReves = crearAlertaSchema.safeParse({
      ...base,
      fechaFlexible: true,
      fechaDesde: '2027-04-03',
      fechaHasta: '2026-10-05',
    });
    expect(alReves.success).toBe(false);
    if (!alReves.success) {
      expect(alReves.error.issues.some((i) => i.path.includes('fechaHasta'))).toBe(true);
    }
  });

  it('rechaza fechas del rango con formato incorrecto', () => {
    expect(
      crearAlertaSchema.safeParse({ ...base, fechaFlexible: true, fechaDesde: '05/10/2026' })
        .success,
    ).toBe(false);
    expect(
      crearAlertaSchema.safeParse({ ...base, fechaFlexible: true, fechaHasta: 'mañana' }).success,
    ).toBe(false);
  });

  it('no deja combinar cualquier fecha con un trayecto recurrente', () => {
    const result = crearAlertaSchema.safeParse({ ...base, recurrente: true, fechaFlexible: true });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('fechaFlexible'))).toBe(true);
    }
  });

  it('actualizar: admite el rango por partes y rechaza el rango invertido', () => {
    expect(actualizarAlertaSchema.safeParse({ fechaFlexible: true }).success).toBe(true);
    expect(actualizarAlertaSchema.safeParse({ fechaDesde: '2026-11-01' }).success).toBe(true);
    expect(
      actualizarAlertaSchema.safeParse({ fechaDesde: '2027-01-01', fechaHasta: '2026-12-01' })
        .success,
    ).toBe(false);
    expect(actualizarAlertaSchema.safeParse({ diasSemana: [4] }).success).toBe(true);
    expect(actualizarAlertaSchema.safeParse({ diasSemana: [9] }).success).toBe(false);
  });
});

describe('normalizarDiasSemana', () => {
  it('quita duplicados, fuera de rango y los deja ordenados', () => {
    expect(normalizarDiasSemana([4, 0, 4, 6])).toEqual([0, 4, 6]);
    expect(normalizarDiasSemana([7, -1, 1.5, 2])).toEqual([2]);
    expect(normalizarDiasSemana([])).toEqual([]);
    expect(normalizarDiasSemana(null)).toEqual([]);
    expect(normalizarDiasSemana(undefined)).toEqual([]);
    expect(normalizarDiasSemana([1, 2, 3, 4, 5])).toEqual([1, 2, 3, 4, 5]);
  });
});
