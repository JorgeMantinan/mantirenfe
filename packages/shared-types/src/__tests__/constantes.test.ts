import { describe, expect, it } from 'vitest';
import { esOuigo, fechaMaximaAlerta, VENTANA_GTFS_DIAS } from '../constantes';

describe('ventana GTFS (antelación máxima de las alertas)', () => {
  it('la fecha máxima es hoy + VENTANA_GTFS_DIAS', () => {
    expect(VENTANA_GTFS_DIAS).toBe(25);
    expect(fechaMaximaAlerta('2026-10-27')).toBe('2026-11-21');
    // Cruzando fin de mes, fin de año y febrero sin bisiesto
    expect(fechaMaximaAlerta('2026-12-20')).toBe('2027-01-14');
    expect(fechaMaximaAlerta('2026-02-20')).toBe('2026-03-17');
  });

  it('rechaza un día que no venga en formato ISO', () => {
    expect(() => fechaMaximaAlerta('27/10/2026')).toThrow('FECHA_INVALIDA');
  });
});

describe('esOuigo', () => {
  it('reconoce el operador importado desde el GTFS de OUIGO', () => {
    expect(esOuigo('OUIGO')).toBe(true);
    expect(esOuigo('ouigo')).toBe(true);
    expect(esOuigo('OUIGO Espana')).toBe(true);
  });

  it('no confunde las marcas de Renfe con OUIGO', () => {
    expect(esOuigo('AVE')).toBe(false);
    expect(esOuigo('AVLO')).toBe(false);
    expect(esOuigo('ALVIA')).toBe(false);
    expect(esOuigo('Madrid-Chamartín -- Barcelona-Sants')).toBe(false);
  });

  it('sin operador (columna vacía) es false', () => {
    expect(esOuigo(null)).toBe(false);
    expect(esOuigo(undefined)).toBe(false);
    expect(esOuigo('')).toBe(false);
  });
});
