import { describe, expect, it } from 'vitest';
import { ahoraRelojGtfs, esDiaAplicable, esLaborable, hoyGtfs } from './reloj';

// 2026-09-27 es domingo: 28 lun, 02/10 viernes, 03/10 sábado, 04/10 domingo
const LUNES = new Date('2026-09-28T12:00:00.000Z');
const VIERNES = new Date('2026-10-02T12:00:00.000Z');
const SABADO = new Date('2026-10-03T12:00:00.000Z');
const DOMINGO = new Date('2026-10-04T12:00:00.000Z');

describe('esLaborable', () => {
  it('lunes a viernes sí, sábado y domingo no', () => {
    expect(esLaborable(LUNES)).toBe(true);
    expect(esLaborable(VIERNES)).toBe(true);
    expect(esLaborable(SABADO)).toBe(false);
    expect(esLaborable(DOMINGO)).toBe(false);
  });

  it('usa el día peninsular aunque el UTC sea del día anterior', () => {
    // 2026-10-04T23:00Z (domingo UTC) = 2026-10-05T01:00 peninsular (lunes)
    expect(esLaborable(ahoraRelojGtfs(new Date('2026-10-04T23:00:00.000Z')))).toBe(true);
    expect(hoyGtfs(new Date('2026-10-04T23:00:00.000Z'))).toBe('2026-10-05');
  });
});

describe('esDiaAplicable', () => {
  it('las no recurrentes son aplicables siempre (van por su fecha de viaje)', () => {
    expect(esDiaAplicable({ recurrente: false, soloLaborables: false }, SABADO)).toBe(true);
    expect(esDiaAplicable({ recurrente: false, soloLaborables: true }, SABADO)).toBe(true);
    expect(esDiaAplicable({}, SABADO)).toBe(true);
    expect(esDiaAplicable({ recurrente: null, soloLaborables: null }, SABADO)).toBe(true);
  });

  it('las recurrentes sin soloLaborables trabajan también el fin de semana', () => {
    expect(esDiaAplicable({ recurrente: true, soloLaborables: false }, SABADO)).toBe(true);
    expect(esDiaAplicable({ recurrente: true, soloLaborables: false }, DOMINGO)).toBe(true);
  });

  it('las recurrentes solo laborables se saltan sábado y domingo', () => {
    expect(esDiaAplicable({ recurrente: true, soloLaborables: true }, LUNES)).toBe(true);
    expect(esDiaAplicable({ recurrente: true, soloLaborables: true }, VIERNES)).toBe(true);
    expect(esDiaAplicable({ recurrente: true, soloLaborables: true }, SABADO)).toBe(false);
    expect(esDiaAplicable({ recurrente: true, soloLaborables: true }, DOMINGO)).toBe(false);
  });

  it('sin fecha explícita usa el reloj peninsular del sistema', () => {
    expect(esDiaAplicable({ recurrente: true, soloLaborables: false })).toBe(true);
    expect(esDiaAplicable({ recurrente: true, soloLaborables: true })).toBe(
      esLaborable(ahoraRelojGtfs()),
    );
  });
});
