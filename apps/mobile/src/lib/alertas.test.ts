import { beforeEach, describe, expect, it } from 'vitest';
import { cambiarIdioma } from '../i18n';
import {
  construirAlertaVuelta,
  etiquetaAvisos,
  etiquetaBono,
  etiquetaEstado,
  validarAlerta,
} from './alertas';

// Fija el español: en CI el runner es en-US y el i18n arranca en 'en'.
beforeEach(async () => {
  await cambiarIdioma('es');
});

const payloadIda = {
  origenNombre: 'Madrid-Chamartín',
  destinoNombre: 'Barcelona-Sants',
  fechaViaje: '2026-11-02',
  recurrente: false,
  soloLaborables: false,
  horaDesde: '08:00',
  horaHasta: null,
  numeroTren: '03311',
  criterio: 'PRECIO',
  precioObjetivo: 45,
  intervaloSondeoMin: 15,
  bono: 'BONO_10',
  notas: 'Solo clase Turista',
};

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

  it('pluraliza el recuento de avisos', () => {
    expect(etiquetaAvisos(0)).toBe('0 avisos');
    expect(etiquetaAvisos(1)).toBe('1 aviso');
    expect(etiquetaAvisos(12)).toBe('12 avisos');
  });
});

describe('construirAlertaVuelta', () => {
  it('invierte origen y destino y conserva el resto', () => {
    const { origenNombre, destinoNombre, ...resto } = payloadIda;
    expect(construirAlertaVuelta(payloadIda)).toEqual({
      ...resto,
      origenNombre: destinoNombre,
      destinoNombre: origenNombre,
    });
  });

  it('no muta el payload de la ida', () => {
    construirAlertaVuelta(payloadIda);
    expect(payloadIda.origenNombre).toBe('Madrid-Chamartín');
    expect(payloadIda.destinoNombre).toBe('Barcelona-Sants');
  });

  it('genera una alerta que la API sigue aceptando', () => {
    expect(validarAlerta(construirAlertaVuelta(payloadIda)).success).toBe(true);
  });
});
