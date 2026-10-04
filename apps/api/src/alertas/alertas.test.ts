import { describe, expect, it } from 'vitest';
import {
  actualizarAlertaSchema,
  crearAlertaSchema,
  DIAS_LABORABLES,
} from '@mantirenfe/shared-types';
import {
  diasSemanaDe,
  esSoloLaborables,
  formatearUltimoEstado,
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
});
