import { describe, expect, it } from 'vitest';
import {
  ahoraRelojGtfs,
  elegirSalidaDelDia,
  elegirTrenRecordatorio,
  preferenciaBooleana,
  type TrenRecordatorio,
} from './recordatorios';

const salidas = (horas: string[]): TrenRecordatorio[] =>
  horas.map((h, i) => ({
    numeroTren: `0${4000 + i}`,
    salida: new Date(`2026-09-25T${h}:00.000Z`),
  }));

describe('ahoraRelojGtfs', () => {
  it('devuelve la hora peninsular tratada como UTC (formato ISO con Z)', () => {
    const d = ahoraRelojGtfs(new Date('2026-06-15T10:00:00.000Z'));
    expect(d.toISOString()).toMatch(/^2026-06-15T12:00:00\.000Z$/); // verano: UTC+2
  });
});

describe('elegirTrenRecordatorio', () => {
  const ahora = new Date('2026-09-25T10:00:00.000Z');

  it('elige la salida más próxima dentro de la ventana de aviso', () => {
    const elegido = elegirTrenRecordatorio(
      salidas(['09:30', '10:30', '11:00', '14:00']),
      ahora,
      50,
      {},
    );
    expect(elegido?.tren.numeroTren).toBe('04001'); // 10:30, la más próxima futura
    expect(elegido?.minutosRestantes).toBe(30);
  });

  it('ignora salidas ya pasadas y fuera de la ventana', () => {
    expect(elegirTrenRecordatorio(salidas(['09:30', '14:00']), ahora, 50, {})).toBeNull();
  });

  it('respeta la franja horaria de la alerta', () => {
    const conFranja = elegirTrenRecordatorio(salidas(['10:30', '10:45']), ahora, 50, {
      horaDesde: '10:40',
      horaHasta: null,
    });
    expect(conFranja?.tren.numeroTren).toBe('04001'); // 10:45 (10:30 queda fuera)
  });

  it('avisa también si quedan menos minutos que el aviso configurado', () => {
    const elegido = elegirTrenRecordatorio(salidas(['10:05']), ahora, 50, {});
    expect(elegido?.minutosRestantes).toBe(5);
  });

  it('devuelve null sin trenes', () => {
    expect(elegirTrenRecordatorio([], ahora, 50, {})).toBeNull();
  });
});

describe('preferenciaBooleana', () => {
  it('usa el default con el "{}" del esquema y con strings no-JSON', () => {
    expect(preferenciaBooleana('{}', 'recordatorioSalida', true)).toBe(true);
    expect(preferenciaBooleana('{}', 'resumenViaje', true)).toBe(true);
    expect(preferenciaBooleana('no-json', 'resumenViaje', true)).toBe(true);
    expect(preferenciaBooleana(null, 'resumenViaje', true)).toBe(true);
  });

  it('lee la clave cuando preferencias es un objeto', () => {
    expect(preferenciaBooleana({ resumenViaje: true }, 'resumenViaje', true)).toBe(true);
    expect(preferenciaBooleana({ resumenViaje: false }, 'resumenViaje', true)).toBe(false);
    expect(preferenciaBooleana({ recordatorioSalida: false }, 'recordatorioSalida', true)).toBe(
      false,
    );
    expect(preferenciaBooleana({ resumenViaje: 'si' }, 'resumenViaje', true)).toBe(true);
  });
});

describe('elegirSalidaDelDia', () => {
  const ahora = new Date('2026-09-25T07:40:00.000Z');

  it('elige la primera salida futura del día', () => {
    const salida = elegirSalidaDelDia(
      [
        { numeroTren: 'A', salida: new Date('2026-09-25T06:00:00Z') }, // pasada
        { numeroTren: 'B', salida: new Date('2026-09-25T09:00:00Z') },
        { numeroTren: 'C', salida: new Date('2026-09-25T12:00:00Z') },
      ],
      ahora,
      {},
    );
    expect(salida?.numeroTren).toBe('B');
  });

  it('respeta la franja horaria de la alerta', () => {
    const trenes = [
      { numeroTren: 'A', salida: new Date('2026-09-25T08:30:00Z') },
      { numeroTren: 'B', salida: new Date('2026-09-25T17:30:00Z') },
    ];
    expect(
      elegirSalidaDelDia(trenes, ahora, { horaDesde: '17:00', horaHasta: '19:00' })?.numeroTren,
    ).toBe('B');
    expect(
      elegirSalidaDelDia(trenes, ahora, { horaDesde: '10:00', horaHasta: '12:00' }),
    ).toBeNull();
  });

  it('null si ya no queda ninguna salida hoy', () => {
    expect(
      elegirSalidaDelDia(
        [{ numeroTren: 'A', salida: new Date('2026-09-25T06:00:00Z') }],
        ahora,
        {},
      ),
    ).toBeNull();
  });
});
