import { describe, expect, it } from 'vitest';
import { actualizarAlertaSchema, crearAlertaSchema } from '@mantirenfe/shared-types';
import { formatearUltimoEstado } from './alertas.service';

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
