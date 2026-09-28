import { describe, expect, it } from 'vitest';
import { construirIcs, nombreFicheroIcs, type AlertaParaIcs } from './ics';

const AHORA = new Date('2026-09-28T10:00:00.000Z');

function alerta(datos: Partial<AlertaParaIcs> = {}): AlertaParaIcs {
  return {
    id: 'alerta-1',
    origenNombre: 'A Coruña',
    destinoNombre: 'Madrid-Chamartín',
    fechaViaje: '2026-10-05',
    horaDesde: null,
    horaHasta: null,
    numeroTren: null,
    recurrente: false,
    soloLaborables: false,
    ultimoEstado: null,
    ...datos,
  };
}

function tren(salida: string, numeroTren = '04314') {
  return { trenId: 't1', numeroTren, salida, disponible: true, precioMin: 25.5 };
}

describe('construirIcs', () => {
  it('monta VCALENDAR/VEVENT/VALARM con fin de línea CRLF', () => {
    const ics = construirIcs(alerta(), AHORA);

    expect(ics).toContain('BEGIN:VCALENDAR\r\n');
    expect(ics).toContain('BEGIN:VEVENT\r\n');
    expect(ics).toContain('BEGIN:VALARM\r\n');
    expect(ics).toContain('END:VCALENDAR\r\n');
    expect(ics.endsWith('\r\n')).toBe(true);
    expect(ics.replace(/\r\n/g, '')).not.toContain('\n');
    expect(ics.replace(/\r\n/g, '')).not.toContain('\r');
  });

  it('usa UID estable y DTSTAMP en UTC', () => {
    expect(construirIcs(alerta(), AHORA)).toContain('UID:mantirenfe-alerta-1@mantirenfe');
    expect(construirIcs(alerta(), AHORA)).toContain('DTSTAMP:20260928T100000Z');
    // Sin id: el UID cae en el slug del trayecto + fecha de viaje
    expect(construirIcs(alerta({ id: undefined }), AHORA)).toContain(
      'UID:mantirenfe-a-coruna-madrid-chamartin-2026-10-05@mantirenfe',
    );
  });

  it('DTSTART con la primera salida conocida de ultimoEstado', () => {
    const ics = construirIcs(
      alerta({
        numeroTren: '04314',
        ultimoEstado: [tren('2026-10-05T09:10:00.000Z'), tren('2026-10-05T07:35:00.000Z')],
      }),
      AHORA,
    );

    expect(ics).toContain('DTSTART:20261005T073500');
    expect(ics).toContain('SUMMARY:Aviso: A Coruña → Madrid-Chamartín 07:35 (tren 04314)');
  });

  it('si ninguna salida cae en la franja, usa la primera del día', () => {
    const ics = construirIcs(
      alerta({
        horaDesde: '08:00',
        horaHasta: '10:00',
        ultimoEstado: [tren('2026-10-05T06:45:00.000Z'), tren('2026-10-05T07:15:00.000Z')],
      }),
      AHORA,
    );

    expect(ics).toContain('DTSTART:20261005T064500');
  });

  it('DTSTART con horaDesde cuando todavía no hay sondeos', () => {
    const ics = construirIcs(alerta({ horaDesde: '08:00', horaHasta: '11:00' }), AHORA);

    expect(ics).toContain('DTSTART:20261005T080000');
    expect(ics).toContain('SUMMARY:Aviso: A Coruña → Madrid-Chamartín 08:00');
    expect(ics).toContain('DESCRIPTION:Alerta de MantiRenfe: A Coruña → Madrid-Chamartín\\n');
    expect(ics).toContain('Franja: 08:00 – 11:00');
  });

  it('sin ninguna hora: DTSTART genérico a las 07:00 y SUMMARY sin hora', () => {
    const ics = construirIcs(alerta(), AHORA);

    expect(ics).toContain('DTSTART:20261005T070000');
    expect(ics).toContain('SUMMARY:Aviso: A Coruña → Madrid-Chamartín\r\n');
    expect(ics).not.toContain('07:00');
  });

  it('recurrente: RRULE diaria con fin a 365 días', () => {
    const ics = construirIcs(alerta({ recurrente: true }), AHORA);

    expect(ics).toContain('RRULE:FREQ=DAILY;UNTIL=20271005T235959\r\n');
  });

  it('recurrente soloLaborables: RRULE con BYDAY de lunes a viernes', () => {
    const ics = construirIcs(alerta({ recurrente: true, soloLaborables: true }), AHORA);

    expect(ics).toContain('RRULE:FREQ=DAILY;UNTIL=20271005T235959;BYDAY=MO,TU,WE,TH,FR\r\n');
  });

  it('puntual: sin RRULE', () => {
    expect(construirIcs(alerta({ recurrente: false }), AHORA)).not.toContain('RRULE');
  });

  it('VALARM 50 minutos antes de la salida (recordatorio de la app)', () => {
    const ics = construirIcs(alerta({ ultimoEstado: [tren('2026-10-05T07:35:00.000Z')] }), AHORA);

    expect(ics).toContain('TRIGGER:-PT50M');
    expect(ics).toContain('ACTION:DISPLAY');
  });

  it('escapa comas, punto y coma y barras invertidas en TEXT', () => {
    const ics = construirIcs(
      alerta({ origenNombre: 'Madrid, Atocha; Sol', destinoNombre: 'Sants; Francia, Barcelona' }),
      AHORA,
    );

    expect(ics).toContain(
      'SUMMARY:Aviso: Madrid\\, Atocha\\; Sol → Sants\\; Francia\\, Barcelona\r\n',
    );
    expect(ics).toContain('LOCATION:Madrid\\, Atocha\\; Sol\r\n');
    expect(ics).not.toContain('Madrid, Atocha');
  });

  it('UID del nombre de archivo con caracteres no ASCII del trayecto', () => {
    expect(nombreFicheroIcs(alerta())).toBe('mantirenfe-a-coruna-madrid-chamartin.ics');
    expect(nombreFicheroIcs(alerta({ origenNombre: 'València-Joaquín Sorolla' }))).toBe(
      'mantirenfe-valencia-joaquin-sorolla-madrid-chamartin.ics',
    );
  });
});
