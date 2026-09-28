import { describe, expect, it } from 'vitest';
import {
  enriquecerSuprimidos,
  horaDesdeMinutos,
  type CancelacionFila,
  type HorarioCancelado,
  type ParadaExtremo,
} from './enriquecer';

const HORARIO: HorarioCancelado = {
  tripId: '0408712026-09-28',
  numeroTren: '04087',
  salida: new Date('2026-09-28T06:55:00.000Z'),
  llegada: new Date('2026-09-28T09:44:00.000Z'),
  origen: { nombre: 'Madrid-Chamartín-Clara Campoamor' },
  destino: { nombre: 'Gijón' },
};

function cancelacion(sobrino: Partial<CancelacionFila> = {}): CancelacionFila {
  return {
    tripId: '0408712026-09-28',
    numeroTren: '04087',
    fecha: new Date('2026-09-28T00:00:00.000Z'),
    ...sobrino,
  };
}

function parada(tripId: string, orden: number, estacion: string, minutos: number): ParadaExtremo {
  return {
    tripId,
    orden,
    salidaMin: minutos,
    llegadaMin: minutos,
    estacion: { nombre: estacion },
  };
}

describe('horaDesdeMinutos', () => {
  it('convierte los minutos GTFS a HH:MM', () => {
    expect(horaDesdeMinutos(0)).toBe('00:00');
    expect(horaDesdeMinutos(420)).toBe('07:00');
    expect(horaDesdeMinutos(459)).toBe('07:39');
    expect(horaDesdeMinutos(59)).toBe('00:59');
  });

  it('envuelve los servicios que acaban tras la medianoche', () => {
    expect(horaDesdeMinutos(1440)).toBe('00:00');
    expect(horaDesdeMinutos(1470)).toBe('00:30');
    expect(horaDesdeMinutos(1530)).toBe('01:30');
  });

  it('sin minutos no hay hora', () => {
    expect(horaDesdeMinutos(null)).toBeNull();
    expect(horaDesdeMinutos(undefined)).toBeNull();
    expect(horaDesdeMinutos(Number.NaN)).toBeNull();
  });
});

describe('enriquecerSuprimidos (con HorarioTren)', () => {
  it('usa los extremos y las horas del horario del día', () => {
    const resultado = enriquecerSuprimidos([cancelacion()], [HORARIO], []);

    expect(resultado).toEqual([
      {
        tripId: '0408712026-09-28',
        numeroTren: '04087',
        fecha: '2026-09-28',
        origen: 'Madrid-Chamartín-Clara Campoamor',
        destino: 'Gijón',
        salida: '06:55',
        llegada: '09:44',
      },
    ]);
  });

  it('si la cancelación no guardó número, se toma el del horario', () => {
    const [fila] = enriquecerSuprimidos([cancelacion({ numeroTren: null })], [HORARIO], []);
    expect(fila?.numeroTren).toBe('04087');
  });

  it('acepta la fecha ya serializada como texto', () => {
    const [fila] = enriquecerSuprimidos(
      [cancelacion({ fecha: '2026-09-28T00:00:00.000Z' })],
      [],
      [],
    );
    expect(fila?.fecha).toBe('2026-09-28');
  });
});

describe('enriquecerSuprimidos (sin HorarioTren: ParadaHorario)', () => {
  it('toma extremos y horas de la primera y la última parada', () => {
    // Desordenadas a propósito: el orden real lo da `orden`
    const paradas = [
      parada('T2', 3, 'Valladolid-Campo Grande', 480),
      parada('T2', 1, 'Madrid-Atocha', 420),
      parada('T2', 9, 'Palencia', 560),
    ];

    const resultado = enriquecerSuprimidos(
      [{ tripId: 'T2', numeroTren: null, fecha: new Date('2026-09-28T00:00:00.000Z') }],
      [],
      paradas,
    );

    expect(resultado).toEqual([
      {
        tripId: 'T2',
        numeroTren: null,
        fecha: '2026-09-28',
        origen: 'Madrid-Atocha',
        destino: 'Palencia',
        salida: '07:00',
        llegada: '09:20',
      },
    ]);
  });

  it('fila sin horario ni paradas: todo a null (badge "Sin datos")', () => {
    const [fila] = enriquecerSuprimidos(
      [{ tripId: 'T-desconocido', numeroTren: null, fecha: new Date('2026-09-28T00:00:00.000Z') }],
      [],
      [],
    );

    expect(fila).toEqual({
      tripId: 'T-desconocido',
      numeroTren: null,
      fecha: '2026-09-28',
      origen: null,
      destino: null,
      salida: null,
      llegada: null,
    });
  });
});

describe('enriquecerSuprimidos (orden)', () => {
  it('ordena por salida y deja los sin hora al final', () => {
    const resultado = enriquecerSuprimidos(
      [
        cancelacion({ tripId: 'sin-datos', numeroTren: null }),
        cancelacion({ tripId: 'tarde', numeroTren: '99999' }),
        cancelacion({ tripId: 'temprano', numeroTren: '11111' }),
      ],
      [
        { ...HORARIO, tripId: 'tarde', salida: new Date('2026-09-28T18:10:00.000Z') },
        { ...HORARIO, tripId: 'temprano', salida: new Date('2026-09-28T06:00:00.000Z') },
      ],
      [],
    );

    expect(resultado.map((f) => f.tripId)).toEqual(['temprano', 'tarde', 'sin-datos']);
    expect(resultado.map((f) => f.fecha)).toEqual(['2026-09-28', '2026-09-28', '2026-09-28']);
  });
});
