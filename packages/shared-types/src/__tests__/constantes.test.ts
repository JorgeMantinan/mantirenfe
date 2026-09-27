import { describe, expect, it } from 'vitest';
import { esOuigo } from '../constantes';

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
