import { describe, expect, it } from 'vitest';
import { horaAMinutos, horaATime, horaATimeNoNula, horaComoTexto } from '../horas';

describe('horaComoTexto (Date de columna @db.Time → HH:MM)', () => {
  it('lee las horas por getUTCHours: el proceso no depende de su zona', () => {
    expect(horaComoTexto(new Date('1970-01-01T17:30:00.000Z'))).toBe('17:30');
    expect(horaComoTexto(new Date('1970-01-01T00:00:00.000Z'))).toBe('00:00');
    expect(horaComoTexto(new Date('1970-01-01T09:05:00.000Z'))).toBe('09:05');
  });

  it('acepta también el texto (mocks y estados guardados)', () => {
    expect(horaComoTexto('17:30')).toBe('17:30');
    expect(horaComoTexto('2026-10-05T07:35:00.000Z')).toBe('07:35');
  });

  it('devuelve null cuando no hay valor o no es reconocible', () => {
    expect(horaComoTexto(null)).toBeNull();
    expect(horaComoTexto(undefined)).toBeNull();
    expect(horaComoTexto('')).toBeNull();
    expect(horaComoTexto('25:00')).toBeNull();
    expect(horaComoTexto('9:00')).toBeNull();
    expect(horaComoTexto(new Date('no-es-fecha'))).toBeNull();
  });
});

describe('horaATime (HH:MM → Date de columna @db.Time)', () => {
  it('fija la fecha de referencia en 1970-01-01 y la hora en UTC', () => {
    expect(horaATime('17:30')?.toISOString()).toBe('1970-01-01T17:30:00.000Z');
    expect(horaATime('00:00')?.toISOString()).toBe('1970-01-01T00:00:00.000Z');
    expect(horaATime('23:59')?.toISOString()).toBe('1970-01-01T23:59:00.000Z');
  });

  it('null / vacío / inválido → null (columna nullable)', () => {
    expect(horaATime(null)).toBeNull();
    expect(horaATime(undefined)).toBeNull();
    expect(horaATime('')).toBeNull();
    expect(horaATime('24:00')).toBeNull();
  });

  it('roundtrip idéntico con horaComoTexto', () => {
    for (const hora of ['17:30', '21:00', '05:00', '00:00', '23:59']) {
      expect(horaComoTexto(horaATime(hora))).toBe(hora);
    }
  });
});

describe('horaATimeNoNula (columna NOT NULL)', () => {
  it('convierte igual que horaATime', () => {
    expect(horaATimeNoNula('08:05').toISOString()).toBe('1970-01-01T08:05:00.000Z');
  });

  it('un valor ilegible cae a medianoche en vez de romper el INSERT', () => {
    expect(horaATimeNoNula(null).toISOString()).toBe('1970-01-01T00:00:00.000Z');
    expect(horaATimeNoNula('29:99').toISOString()).toBe('1970-01-01T00:00:00.000Z');
  });
});

describe('horaAMinutos', () => {
  it('convierte texto y Date al mismo número de minutos', () => {
    expect(horaAMinutos('17:30')).toBe(1050);
    expect(horaAMinutos(new Date('1970-01-01T17:30:00.000Z'))).toBe(1050);
    expect(horaAMinutos('00:00')).toBe(0);
    expect(horaAMinutos('23:59')).toBe(1439);
  });

  it('null si no hay valor', () => {
    expect(horaAMinutos(null)).toBeNull();
    expect(horaAMinutos(undefined)).toBeNull();
    expect(horaAMinutos('24:00')).toBeNull();
  });
});
