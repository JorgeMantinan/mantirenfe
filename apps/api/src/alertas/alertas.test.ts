import { describe, expect, it } from 'vitest';
import {
  actualizarAlertaSchema,
  crearAlertaSchema,
  DIAS_LABORABLES,
} from '@mantirenfe/shared-types';
import {
  criteriosGuardados,
  diasSemanaDe,
  esSoloLaborables,
  formatearAlerta,
  formatearUltimoEstado,
  normalizarCriterios,
  rangoFlexible,
} from './alertas.service';

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

  it('admite la casilla de 1 escala solo como booleano', () => {
    const base = {
      origenNombre: 'A Coruña',
      destinoNombre: 'Vigo',
      fechaViaje: '2026-10-05',
      criterio: 'DISPONIBILIDAD',
    };
    expect(crearAlertaSchema.safeParse({ ...base, conexiones: true }).success).toBe(true);
    expect(crearAlertaSchema.safeParse({ ...base, conexiones: false }).success).toBe(true);
    expect(crearAlertaSchema.safeParse({ ...base, conexiones: 'si' }).success).toBe(false);
    expect(actualizarAlertaSchema.safeParse({ conexiones: true }).success).toBe(true);
  });
});

describe('crearAlertaSchema (trayecto cotidiano)', () => {
  const base = {
    origenNombre: 'Madrid-Atocha',
    destinoNombre: 'Valencia-Joaquín Sorolla',
    fechaViaje: '2026-11-15',
  };

  it('acepta alertas recurrentes (cada día y solo laborables)', () => {
    const diaria = crearAlertaSchema.safeParse({ ...base, recurrente: true });
    expect(diaria.success).toBe(true);
    if (diaria.success) {
      expect(diaria.data.recurrente).toBe(true);
      expect(diaria.data.soloLaborables).toBe(false);
    }

    const laborables = crearAlertaSchema.safeParse({
      ...base,
      recurrente: true,
      soloLaborables: true,
    });
    expect(laborables.success).toBe(true);
    if (laborables.success) {
      expect(laborables.data.soloLaborables).toBe(true);
    }
  });

  it('por defecto sigue siendo una alerta de una sola fecha', () => {
    const resultado = crearAlertaSchema.safeParse(base);
    expect(resultado.success).toBe(true);
    if (resultado.success) {
      expect(resultado.data.recurrente).toBe(false);
      expect(resultado.data.soloLaborables).toBe(false);
    }
  });
});

describe('actualizarAlertaSchema (edición)', () => {
  it('acepta cambiar la ruta, la fecha y el tren', () => {
    const resultado = actualizarAlertaSchema.safeParse({
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
    expect(actualizarAlertaSchema.safeParse({ estado: 'PAUSA' }).success).toBe(true);
    expect(actualizarAlertaSchema.safeParse({ notas: null }).success).toBe(true);
    expect(actualizarAlertaSchema.safeParse({ intervaloSondeoMin: 15 }).success).toBe(true);
  });

  it('rechaza fechas y horas inválidas', () => {
    expect(actualizarAlertaSchema.safeParse({ fechaViaje: 'mañana' }).success).toBe(false);
    expect(actualizarAlertaSchema.safeParse({ horaDesde: '25:99' }).success).toBe(false);
    expect(actualizarAlertaSchema.safeParse({ criterio: 'NINGUNO' }).success).toBe(false);
  });
});

describe('diasSemanaDe (formato único de días)', () => {
  it('las alertas no recurrentes no tienen días marcados', () => {
    expect(diasSemanaDe({ recurrente: false, diasSemana: [4] })).toEqual([]);
    expect(diasSemanaDe({ recurrente: false, soloLaborables: true })).toEqual([]);
  });

  it('diasSemana manda si viene, aunque sea vacío (todos los días)', () => {
    expect(diasSemanaDe({ recurrente: true, diasSemana: [4, 0, 4] })).toEqual([0, 4]);
    expect(diasSemanaDe({ recurrente: true, diasSemana: [], soloLaborables: true })).toEqual([]);
  });

  it('convierte el legado soloLaborables a lunes a viernes', () => {
    expect(diasSemanaDe({ recurrente: true, soloLaborables: true })).toEqual([...DIAS_LABORABLES]);
    expect(diasSemanaDe({ recurrente: true, soloLaborables: false })).toEqual([]);
    // Sin días en la entrada se conservan los ya guardados (edición)
    expect(diasSemanaDe({ recurrente: true }, [4, 6])).toEqual([4, 6]);
    expect(diasSemanaDe({ recurrente: true }, [])).toEqual([]);
  });
});

describe('esSoloLaborables (espejo del formato legado)', () => {
  it('solo es true si los días marcados son exactamente lunes a viernes', () => {
    expect(esSoloLaborables([1, 2, 3, 4, 5])).toBe(true);
    expect(esSoloLaborables([1, 2, 3])).toBe(false);
    expect(esSoloLaborables([1, 2, 3, 4, 5, 6])).toBe(false);
    expect(esSoloLaborables([])).toBe(false);
  });
});

describe('rangoFlexible (cualquier fecha en los próximos 6 meses)', () => {
  const HOY = '2026-10-05';

  it('si no es flexible no hay rango', () => {
    expect(rangoFlexible(false, '2026-11-01', '2026-12-01', HOY)).toBeNull();
  });

  it('por defecto va de hoy a hoy + 180 días', () => {
    expect(rangoFlexible(true, undefined, undefined, HOY)).toEqual({
      desde: HOY,
      hasta: '2027-04-03',
    });
  });

  it('respeta el rango del usuario', () => {
    expect(rangoFlexible(true, '2026-11-01', '2026-12-01', HOY)).toEqual({
      desde: '2026-11-01',
      hasta: '2026-12-01',
    });
  });

  it('acota el fin al inicio si el usuario se pasa del horizonte', () => {
    expect(rangoFlexible(true, '2027-06-01', undefined, HOY)).toEqual({
      desde: '2027-06-01',
      hasta: '2027-06-01',
    });
  });
});

describe('formatearUltimoEstado (columnas de "Plazas de hoy")', () => {
  it('devuelve los campos de detalle de conexión/llegada/tarifa', () => {
    const filas = formatearUltimoEstado([
      {
        trenId: '09201 + 00622-2026-10-05',
        numeroTren: '09201 + 00622',
        salida: '21:00',
        disponible: true,
        precioMin: 12.9,
        tramo: 'conexion',
        conexionEn: 'SANTIAGO DE COMPOSTELA-DANIEL CASTELAO',
        horaLlegada: '22:57',
        duracionMin: 117,
        tipoTren: 'AVANT + ALVIA',
        tarifa: 'Básico',
      },
    ]);
    expect(filas?.[0]).toMatchObject({
      trenId: '09201 + 00622-2026-10-05',
      tramo: 'conexion',
      conexionEn: 'SANTIAGO DE COMPOSTELA-DANIEL CASTELAO',
      horaLlegada: '22:57',
      duracionMin: 117,
      tipoTren: 'AVANT + ALVIA',
      tarifa: 'Básico',
    });
  });

  it('omite los opcionales mal tipados y descarta filas incompletas', () => {
    const filas = formatearUltimoEstado([
      {
        trenId: 'a',
        numeroTren: '04404',
        salida: '19:33',
        disponible: true,
        tramo: 'inventado',
        duracionMin: 'largo',
        conexionEn: 42,
        tarifa: '',
      },
      { trenId: 42, salida: '08:00', disponible: true },
      { trenId: 'b' },
    ]);
    expect(filas).toHaveLength(1);
    expect(filas?.[0]).toMatchObject({ trenId: 'a', cancelado: false, precioMin: null });
    expect(filas?.[0]).not.toHaveProperty('tramo');
    expect(filas?.[0]).not.toHaveProperty('duracionMin');
    expect(filas?.[0]).not.toHaveProperty('conexionEn');
    expect(filas?.[0]).not.toHaveProperty('tarifa');
  });

  it('devuelve null si el estado guardado no es una lista', () => {
    expect(formatearUltimoEstado(null)).toBeNull();
    expect(formatearUltimoEstado(undefined)).toBeNull();
    expect(formatearUltimoEstado({})).toBeNull();
  });

  it('conserva el criterio de cada fila si el estado lo trae etiquetado', () => {
    const filas = formatearUltimoEstado([
      {
        trenId: 'a',
        numeroTren: '04404',
        salida: '19:33',
        disponible: true,
        criterio: 'RETRASO',
      },
    ]);
    expect(filas?.[0]).toMatchObject({ trenId: 'a', criterio: 'RETRASO' });
    // Sin etiqueta (estado legado) no aparece el campo
    const legado = formatearUltimoEstado([
      { trenId: 'b', numeroTren: '04404', salida: '19:33', disponible: true },
    ]);
    expect(legado?.[0]).not.toHaveProperty('criterio');
  });
});

/** Fila mínima de `Alerta` con la que probar `formatearAlerta`. */
function filaAlerta(
  parcial: Partial<Parameters<typeof formatearAlerta>[0]> = {},
): Parameters<typeof formatearAlerta>[0] {
  return {
    id: 'a1',
    origenNombre: 'Madrid-Atocha',
    destinoNombre: 'Barcelona-Sants',
    fechaViaje: new Date('2026-11-15T00:00:00Z'),
    horaDesde: null,
    horaHasta: null,
    numeroTren: null,
    criterio: 'DISPONIBILIDAD',
    conexiones: false,
    precioObjetivo: null,
    estado: 'ACTIVA',
    recurrente: false,
    diasSemana: [],
    fechaFlexible: false,
    fechaDesde: null,
    fechaHasta: null,
    intervaloSondeoMin: 10,
    bono: 'GENERAL',
    notas: null,
    ultimoSondeoEn: null,
    creadaEn: new Date('2026-11-01T10:00:00Z'),
    grupoId: null,
    ...parcial,
  };
}

describe('normalizarCriterios (lista vigilada)', () => {
  it('deduplica preservando el orden del cliente', () => {
    expect(normalizarCriterios(['PRECIO', 'DISPONIBILIDAD', 'PRECIO'], 'PRECIO')).toEqual([
      'PRECIO',
      'DISPONIBILIDAD',
    ]);
  });

  it('sin lista (o vacía) se queda con el criterio único legado', () => {
    expect(normalizarCriterios(undefined, 'RETRASO')).toEqual(['RETRASO']);
    expect(normalizarCriterios([], 'RETRASO')).toEqual(['RETRASO']);
  });
});

describe('criteriosGuardados (fila de la BD)', () => {
  it('lista vacía o ausente = alerta legada', () => {
    expect(criteriosGuardados({ criterio: 'HORARIO', criterios: [] })).toEqual(['HORARIO']);
    expect(criteriosGuardados({ criterio: 'HORARIO' })).toEqual(['HORARIO']);
  });

  it('con lista devuelve la lista entera', () => {
    expect(
      criteriosGuardados({ criterio: 'DISPONIBILIDAD', criterios: ['RETRASO', 'DISPONIBILIDAD'] }),
    ).toEqual(['RETRASO', 'DISPONIBILIDAD']);
  });
});

describe('formatearAlerta (respuesta multi-criterio)', () => {
  it('devuelve la lista guardada y deja `criterio` como su primero', () => {
    const respuesta = formatearAlerta(
      filaAlerta({
        criterio: 'DISPONIBILIDAD',
        criterios: ['DISPONIBILIDAD', 'PRECIO'],
        precioObjetivo: 30,
      }),
    );
    expect(respuesta.criterios).toEqual(['DISPONIBILIDAD', 'PRECIO']);
    expect(respuesta.criterio).toBe('DISPONIBILIDAD');
    expect(respuesta.precioObjetivo).toBe(30);
  });

  it('una alerta legada (lista vacía) responde exactamente `[criterio]`', () => {
    const respuesta = formatearAlerta(filaAlerta({ criterio: 'RETRASO', criterios: [] }));
    expect(respuesta.criterios).toEqual(['RETRASO']);
    expect(respuesta.criterio).toBe('RETRASO');
  });
});

describe('formatearAlerta (conexiones / 1 escala)', () => {
  it('devuelve el flag cuando se vigila disponibilidad', () => {
    const respuesta = formatearAlerta(
      filaAlerta({ conexiones: true, criterios: ['DISPONIBILIDAD', 'RETRASO'] }),
    );
    expect(respuesta.conexiones).toBe(true);
  });

  it('lo deja en false si DISPONIBILIDAD no está vigilado', () => {
    const respuesta = formatearAlerta(
      filaAlerta({ conexiones: true, criterio: 'RETRASO', criterios: ['RETRASO'] }),
    );
    expect(respuesta.conexiones).toBe(false);
  });

  it('una alerta sin marcar responde false', () => {
    expect(formatearAlerta(filaAlerta()).conexiones).toBe(false);
  });
});

describe('formatearAlerta (franja @db.Time → HH:MM)', () => {
  it('convierte el Date que devuelve Prisma a texto HH:MM', () => {
    const respuesta = formatearAlerta(
      filaAlerta({
        horaDesde: new Date('1970-01-01T17:30:00.000Z'),
        horaHasta: new Date('1970-01-01T21:00:00.000Z'),
      }),
    );
    expect(respuesta.horaDesde).toBe('17:30');
    expect(respuesta.horaHasta).toBe('21:00');
  });

  it('sigue aceptando texto (mocks) y devuelve null si no hay franja', () => {
    expect(formatearAlerta(filaAlerta({ horaDesde: '07:05' })).horaDesde).toBe('07:05');
    expect(formatearAlerta(filaAlerta()).horaDesde).toBeNull();
    expect(formatearAlerta(filaAlerta()).horaHasta).toBeNull();
  });
});
