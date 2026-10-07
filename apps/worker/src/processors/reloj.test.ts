import { describe, expect, it } from 'vitest';
import { ahoraRelojGtfs, esDiaAplicable, esLaborable, hoyGtfs, proximoDiaAplicable } from './reloj';

// 2026-09-27 es domingo: 28 lun, 02/10 viernes, 03/10 sábado, 04/10 domingo
const LUNES = new Date('2026-09-28T12:00:00.000Z');
const VIERNES = new Date('2026-10-02T12:00:00.000Z');
const SABADO = new Date('2026-10-03T12:00:00.000Z');
const DOMINGO = new Date('2026-10-04T12:00:00.000Z');
// 04 es domingo, así que 06 martes y 07 miércoles
const MARTES = new Date('2026-10-06T12:00:00.000Z');
const MIERCOLES = new Date('2026-10-07T12:00:00.000Z');

/** YYYY-MM-DD de la fecha devuelta (comparar fechas, no horas). */
function dia(devuelta: Date): string {
  return devuelta.toISOString().slice(0, 10);
}

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
    expect(
      esDiaAplicable({ recurrente: false, diasSemana: [], soloLaborables: false }, SABADO),
    ).toBe(true);
    expect(
      esDiaAplicable(
        { recurrente: false, diasSemana: [1, 2, 3, 4, 5], soloLaborables: true },
        SABADO,
      ),
    ).toBe(true);
    expect(esDiaAplicable({}, SABADO)).toBe(true);
    expect(esDiaAplicable({ recurrente: null, soloLaborables: null }, SABADO)).toBe(true);
  });

  it('las recurrentes sin días marcados trabajan también el fin de semana', () => {
    expect(
      esDiaAplicable({ recurrente: true, diasSemana: [], soloLaborables: false }, SABADO),
    ).toBe(true);
    expect(
      esDiaAplicable({ recurrente: true, diasSemana: [], soloLaborables: false }, DOMINGO),
    ).toBe(true);
  });

  it('las recurrentes con días marcados solo trabajan esos días', () => {
    // 2026-10-02 viernes, 2026-10-03 sábado, 2026-09-28 lunes
    const jueves = { recurrente: true, diasSemana: [4] };
    expect(esDiaAplicable(jueves, new Date('2026-10-01T12:00:00.000Z'))).toBe(true);
    expect(esDiaAplicable(jueves, VIERNES)).toBe(false);
    expect(esDiaAplicable(jueves, SABADO)).toBe(false);
    expect(esDiaAplicable(jueves, DOMINGO)).toBe(false);
    expect(esDiaAplicable(jueves, LUNES)).toBe(false);

    const finde = { recurrente: true, diasSemana: [0, 6] };
    expect(esDiaAplicable(finde, SABADO)).toBe(true);
    expect(esDiaAplicable(finde, DOMINGO)).toBe(true);
    expect(esDiaAplicable(finde, LUNES)).toBe(false);

    const lunesViernes = { recurrente: true, diasSemana: [1, 2, 3, 4, 5] };
    expect(esDiaAplicable(lunesViernes, LUNES)).toBe(true);
    expect(esDiaAplicable(lunesViernes, VIERNES)).toBe(true);
    expect(esDiaAplicable(lunesViernes, SABADO)).toBe(false);
    expect(esDiaAplicable(lunesViernes, DOMINGO)).toBe(false);
  });

  it('la semana completa equivale a no marcar ningún día', () => {
    const todos = { recurrente: true, diasSemana: [0, 1, 2, 3, 4, 5, 6] };
    for (const dia of [LUNES, VIERNES, SABADO, DOMINGO]) {
      expect(esDiaAplicable(todos, dia)).toBe(true);
    }
  });

  it('lee el legado soloLaborables (lun-vie) cuando diasSemana está vacío', () => {
    expect(esDiaAplicable({ recurrente: true, soloLaborables: true }, LUNES)).toBe(true);
    expect(esDiaAplicable({ recurrente: true, soloLaborables: true }, VIERNES)).toBe(true);
    expect(esDiaAplicable({ recurrente: true, soloLaborables: true }, SABADO)).toBe(false);
    expect(esDiaAplicable({ recurrente: true, soloLaborables: true }, DOMINGO)).toBe(false);
  });

  it('si hay días marcados, mandan ellos sobre el legado soloLaborables', () => {
    expect(
      esDiaAplicable({ recurrente: true, diasSemana: [6], soloLaborables: true }, SABADO),
    ).toBe(true);
    expect(esDiaAplicable({ recurrente: true, diasSemana: [6], soloLaborables: true }, LUNES)).toBe(
      false,
    );
  });

  it('sin fecha explícita usa el reloj peninsular del sistema', () => {
    expect(esDiaAplicable({ recurrente: true, diasSemana: [], soloLaborables: false })).toBe(true);
    expect(esDiaAplicable({ recurrente: true, soloLaborables: true })).toBe(
      esLaborable(ahoraRelojGtfs()),
    );
    const hoy = ahoraRelojGtfs().getUTCDay();
    expect(esDiaAplicable({ recurrente: true, diasSemana: [hoy] })).toBe(true);
    expect(esDiaAplicable({ recurrente: true, diasSemana: [(hoy + 1) % 7] })).toBe(false);
  });
});

describe('proximoDiaAplicable', () => {
  const domYVie = { recurrente: true, diasSemana: [0, 5] };

  it('miércoles con dom+vie apunta al viernes de esa semana', () => {
    expect(dia(proximoDiaAplicable(domYVie, MIERCOLES))).toBe('2026-10-09');
  });

  it('lunes con solo viernes apunta al viernes', () => {
    expect(dia(proximoDiaAplicable({ recurrente: true, diasSemana: [5] }, LUNES))).toBe(
      '2026-10-02',
    );
  });

  it('viernes con dom+vie se queda en el propio viernes (hoy ya toca)', () => {
    expect(dia(proximoDiaAplicable(domYVie, VIERNES))).toBe('2026-10-02');
  });

  it('domingo con dom+vie se queda en el propio domingo', () => {
    expect(dia(proximoDiaAplicable(domYVie, DOMINGO))).toBe('2026-10-04');
  });

  it('sábado con dom+vie salta al domingo siguiente', () => {
    expect(dia(proximoDiaAplicable(domYVie, SABADO))).toBe('2026-10-04');
  });

  it('con los días vacíos la fecha objetivo es el propio día', () => {
    expect(dia(proximoDiaAplicable({ recurrente: true, diasSemana: [] }, MIERCOLES))).toBe(
      '2026-10-07',
    );
    expect(dia(proximoDiaAplicable({ recurrente: true }, MARTES))).toBe('2026-10-06');
  });

  it('las no recurrentes siempre van a su fecha (aunque tengan días marcados)', () => {
    expect(dia(proximoDiaAplicable({ recurrente: false, diasSemana: [5] }, MARTES))).toBe(
      '2026-10-06',
    );
    expect(dia(proximoDiaAplicable({ recurrente: null, diasSemana: [0, 5] }, MARTES))).toBe(
      '2026-10-06',
    );
  });

  it('devuelve una copia: la fecha de entrada no se toca', () => {
    const entrada = new Date('2026-10-07T12:00:00.000Z');
    proximoDiaAplicable(domYVie, entrada);
    expect(entrada.toISOString()).toBe('2026-10-07T12:00:00.000Z');
  });
});
