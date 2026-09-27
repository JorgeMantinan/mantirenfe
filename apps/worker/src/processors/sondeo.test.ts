import { describe, expect, it } from 'vitest';
import type { EstadoDisponibilidad } from '@mantirenfe/shared-types';
import {
  diffDisponibles,
  diffHorarios,
  enFranjaHoraria,
  filtrarRetrasados,
  pushHabilitado,
  serializarEstado,
  textoIndemnizacion,
} from './sondeo';

function estado(trenes: EstadoDisponibilidad['trenes']): EstadoDisponibilidad {
  return {
    consulta: {
      origenNombre: 'Madrid',
      destinoNombre: 'Sevilla',
      fecha: '2026-10-01',
    },
    trenes,
    consultadoEn: new Date().toISOString(),
  };
}

describe('serializarEstado', () => {
  it('ordena por trenId e incluye retraso', () => {
    const serie = serializarEstado(
      estado([
        {
          trenId: 'b',
          numeroTren: '2',
          salida: '10:00',
          disponible: true,
          precioMin: 20,
          moneda: 'EUR',
          retrasoSeg: 600,
        },
        {
          trenId: 'a',
          numeroTren: '1',
          salida: '08:00',
          disponible: false,
          precioMin: null,
          moneda: 'EUR',
        },
      ]),
    );
    expect(serie.map((t) => t.trenId)).toEqual(['a', 'b']);
    expect(serie[1]?.retrasoSeg).toBe(600);
    expect(serie[0]?.retrasoSeg).toBeNull();
  });
});

describe('diffDisponibles', () => {
  it('detecta un tren que pasa de no disponible a disponible', () => {
    const anterior = serializarEstado(
      estado([
        {
          trenId: 't1',
          numeroTren: '1',
          salida: '08:00',
          disponible: false,
          precioMin: null,
          moneda: 'EUR',
        },
        {
          trenId: 't2',
          numeroTren: '2',
          salida: '10:00',
          disponible: true,
          precioMin: 15,
          moneda: 'EUR',
        },
      ]),
    );
    const actual = serializarEstado(
      estado([
        {
          trenId: 't1',
          numeroTren: '1',
          salida: '08:00',
          disponible: true,
          precioMin: 15,
          moneda: 'EUR',
        },
        {
          trenId: 't2',
          numeroTren: '2',
          salida: '10:00',
          disponible: true,
          precioMin: 15,
          moneda: 'EUR',
        },
      ]),
    );

    const { aparecen } = diffDisponibles(anterior, actual);
    expect(aparecen.map((t) => t.trenId)).toEqual(['t1']);
  });
});

describe('diffHorarios', () => {
  it('detecta salidas nuevas, retiradas y horas cambiadas', () => {
    const anterior = serializarEstado(
      estado([
        {
          trenId: 't1',
          numeroTren: '1',
          salida: '08:00',
          disponible: true,
          precioMin: null,
          moneda: 'EUR',
        },
        {
          trenId: 't2',
          numeroTren: '2',
          salida: '10:00',
          disponible: true,
          precioMin: null,
          moneda: 'EUR',
        },
      ]),
    );
    const actual = serializarEstado(
      estado([
        {
          trenId: 't1',
          numeroTren: '1',
          salida: '08:15',
          disponible: true,
          precioMin: null,
          moneda: 'EUR',
        },
        {
          trenId: 't3',
          numeroTren: '3',
          salida: '12:00',
          disponible: true,
          precioMin: null,
          moneda: 'EUR',
        },
      ]),
    );

    const { nuevos, salidos, cambiados } = diffHorarios(anterior, actual);
    expect(nuevos.map((t) => t.trenId)).toEqual(['t3']);
    expect(salidos.map((t) => t.trenId)).toEqual(['t2']);
    expect(cambiados.map((t) => t.trenId)).toEqual(['t1']);
  });
});

describe('filtrarRetrasados', () => {
  it('solo devuelve trenes sobre el umbral', () => {
    const actual = serializarEstado(
      estado([
        {
          trenId: 't1',
          numeroTren: '1',
          salida: '08:00',
          disponible: true,
          precioMin: null,
          moneda: 'EUR',
          retrasoSeg: 600,
        },
        {
          trenId: 't2',
          numeroTren: '2',
          salida: '09:00',
          disponible: true,
          precioMin: null,
          moneda: 'EUR',
          retrasoSeg: 60,
        },
        {
          trenId: 't3',
          numeroTren: '3',
          salida: '10:00',
          disponible: true,
          precioMin: null,
          moneda: 'EUR',
        },
      ]),
    );
    expect(filtrarRetrasados(actual, 300).map((t) => t.trenId)).toEqual(['t1']);
  });
});

describe('pushHabilitado', () => {
  it('activo por defecto y en objeto/string salvo que la preferencia esté en false', () => {
    expect(pushHabilitado(undefined)).toBe(true);
    expect(pushHabilitado(null)).toBe(true);
    expect(pushHabilitado({})).toBe(true);
    expect(pushHabilitado({ notificacionesPush: true })).toBe(true);
    expect(pushHabilitado({ notificacionesPush: false })).toBe(false);
    expect(pushHabilitado('{"notificacionesPush":false}')).toBe(false);
    expect(pushHabilitado('{"notificacionesPush":true}')).toBe(true);
    expect(pushHabilitado('{no es json')).toBe(true);
  });
});

describe('textoIndemnizacion', () => {
  it('sin aviso por debajo del umbral principal (60 min)', () => {
    expect(textoIndemnizacion(0)).toBe('');
    expect(textoIndemnizacion(300)).toBe('');
    expect(textoIndemnizacion(59 * 60)).toBe('');
  });

  it('avisa a partir de 60 min de retraso con el rango 50-100%', () => {
    const aviso = textoIndemnizacion(60 * 60);
    expect(aviso).toContain('indemnización');
    expect(aviso).toContain('50-100%');
    expect(textoIndemnizacion(95 * 60)).toBe(aviso);
  });

  it('ignora valores no válidos', () => {
    expect(textoIndemnizacion(-1)).toBe('');
    expect(textoIndemnizacion(Number.NaN)).toBe('');
  });
});

describe('enFranjaHoraria', () => {
  it('sin franja todo vale', () => {
    expect(enFranjaHoraria('2026-09-26T06:00:00.000Z', null, null)).toBe(true);
  });

  it('filtra por HH:MM con salidas ISO y sueltas', () => {
    expect(enFranjaHoraria('2026-09-26T17:30:00.000Z', '17:00', '19:00')).toBe(true);
    expect(enFranjaHoraria('17:00', '17:00', '19:00')).toBe(true);
    expect(enFranjaHoraria('19:00', '17:00', '19:00')).toBe(true);
    expect(enFranjaHoraria('2026-09-26T06:00:00.000Z', '17:00', '19:00')).toBe(false);
    expect(enFranjaHoraria('20:01', '17:00', '19:00')).toBe(false);
  });

  it('respeta solo desde o solo hasta', () => {
    expect(enFranjaHoraria('08:00', '07:00', null)).toBe(true);
    expect(enFranjaHoraria('06:00', '07:00', null)).toBe(false);
    expect(enFranjaHoraria('22:00', null, '23:00')).toBe(true);
    expect(enFranjaHoraria('23:30', null, '23:00')).toBe(false);
  });
});
