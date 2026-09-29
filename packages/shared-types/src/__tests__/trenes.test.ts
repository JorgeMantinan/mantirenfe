import { describe, expect, it } from 'vitest';
import { duracionCorta, textoConexion } from '../dto/trenes';

describe('textoConexion (línea de "Plazas de hoy")', () => {
  it('une estación, horas de enlace y espera', () => {
    expect(
      textoConexion({
        conexionEn: 'MADRID-CHAMARTÍN',
        conexionLlegada: '12:15',
        conexionSalida: '13:40',
        esperaMin: 85,
      }),
    ).toBe('Conexión en MADRID-CHAMARTÍN — llega 12:15 · sale 13:40 (espera 1h25)');
  });

  it('pinta solo lo que trae la fuente (compatibilidad con estados antiguos)', () => {
    expect(textoConexion({ conexionEn: 'SANTIAGO' })).toBe('Conexión en SANTIAGO');
    expect(textoConexion({ conexionEn: 'SANTIAGO', conexionLlegada: '21:29' })).toBe(
      'Conexión en SANTIAGO — llega 21:29',
    );
    expect(textoConexion({ conexionSalida: '21:50' })).toBe('Conexión en — sale 21:50');
    expect(textoConexion({})).toBe('Conexión en —');
  });

  it('ignora esperas no numéricas o negativas', () => {
    const base = { conexionEn: 'X', conexionLlegada: '10:00', conexionSalida: '10:30' };
    expect(textoConexion({ ...base, esperaMin: Number.NaN })).toBe(
      'Conexión en X — llega 10:00 · sale 10:30',
    );
    expect(textoConexion({ ...base, esperaMin: -15 })).toBe(
      'Conexión en X — llega 10:00 · sale 10:30',
    );
    expect(textoConexion({ ...base, esperaMin: 30 })).toBe(
      `Conexión en X — llega 10:00 · sale 10:30 (espera ${duracionCorta(30)})`,
    );
  });
});
