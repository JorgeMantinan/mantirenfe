import { describe, expect, it } from 'vitest';
import { COOLDOWN_AVISO_PLAZA_MS, filtrarCooldownPlazas } from './sondeo';

const ahora = Date.parse('2026-10-13T12:00:00Z');
const avisoPlaza = { titulo: '¡Plaza disponible!', datos: { criterio: 'DISPONIBILIDAD' } };
const avisoPlazaLegado = { titulo: '¡Plaza disponible!', datos: undefined };
const avisoRetraso = { titulo: 'Retraso en tu tren', datos: { criterio: 'RETRASO' } };

describe('filtrarCooldownPlazas', () => {
  it('sin aviso previo conserva todo', () => {
    const salida = filtrarCooldownPlazas([avisoPlaza], null, ahora);
    expect(salida).toHaveLength(1);
  });

  it('el último aviso era de plaza y está dentro de la ventana: quita los de plaza y conserva otros criterios', () => {
    const ultima = {
      creadaEn: new Date(ahora - 10 * 60_000),
      titulo: avisoPlaza.titulo,
      datos: avisoPlaza.datos,
    };
    const salida = filtrarCooldownPlazas([avisoPlaza, avisoRetraso], ultima, ahora);
    expect(salida).toEqual([avisoRetraso]);
  });

  it('el último aviso era de plaza LEGADO (sin criterio en datos)', () => {
    const ultima = {
      creadaEn: new Date(ahora - 5 * 60_000),
      titulo: avisoPlazaLegado.titulo,
      datos: null,
    };
    expect(filtrarCooldownPlazas([avisoPlazaLegado], ultima, ahora)).toHaveLength(0);
  });

  it('ventana cumplida (más de1 h): vuelve a avisar', () => {
    const ultima = {
      creadaEn: new Date(ahora - COOLDOWN_AVISO_PLAZA_MS - 60_000),
      titulo: avisoPlaza.titulo,
      datos: avisoPlaza.datos,
    };
    expect(filtrarCooldownPlazas([avisoPlaza], ultima, ahora)).toHaveLength(1);
  });

  it('el último aviso fue de retraso: los de plaza no se tocan', () => {
    const ultima = {
      creadaEn: new Date(ahora - 60_000),
      titulo: avisoRetraso.titulo,
      datos: avisoRetraso.datos,
    };
    expect(filtrarCooldownPlazas([avisoPlaza], ultima, ahora)).toHaveLength(1);
  });
});
