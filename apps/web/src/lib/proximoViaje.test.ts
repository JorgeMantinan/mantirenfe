import { describe, expect, it } from 'vitest';
import type { AlertaResponse, EstadoSerializado } from '@mantirenfe/shared-types';
import { formatearPrecio } from './precios';
import {
  aplicaEnFecha,
  cuentaAtras,
  etiquetaDia,
  instantePeninsular,
  proximaFechaAplicable,
  proximaSalida,
  textoPlazas,
  variantePlazas,
} from './proximoViaje';

/** Lunes 28 sep 2026, 07:00 peninsular (CEST: 05:00 UTC). */
const AHORA = new Date('2026-09-28T05:00:00Z');
const HOY = '2026-09-28';
/** Sábado 26 sep 2026, 07:00 peninsular. */
const SABADO = new Date('2026-09-26T05:00:00Z');
const SABADO_FECHA = '2026-09-26';

function alerta(datos: Partial<AlertaResponse> = {}): AlertaResponse {
  return {
    id: 'a1',
    origenNombre: 'Madrid-Chamartín',
    destinoNombre: 'Barcelona-Sants',
    fechaViaje: HOY,
    horaDesde: null,
    horaHasta: null,
    numeroTren: null,
    criterio: 'DISPONIBILIDAD',
    precioObjetivo: null,
    estado: 'ACTIVA',
    recurrente: true,
    soloLaborables: false,
    intervaloSondeoMin: 10,
    bono: 'GENERAL',
    notas: null,
    ultimoSondeoEn: '2026-09-28T05:00:00.000Z',
    ultimoEstado: null,
    creadaEn: '2026-09-01T10:00:00.000Z',
    ...datos,
  };
}

function tren(datos: Partial<EstadoSerializado> & { salida: string }): EstadoSerializado {
  return {
    trenId: 't1',
    numeroTren: '03311',
    disponible: true,
    precioMin: 45,
    cancelado: false,
    ...datos,
  };
}

function delDia(hora: string, datos: Partial<EstadoSerializado> = {}): EstadoSerializado {
  return tren({ salida: `${HOY}T${hora}:00.000Z`, ...datos });
}

describe('proximaSalida', () => {
  it('toma la primera salida de hoy dentro de la franja horaria', () => {
    const salida = proximaSalida(
      [
        alerta({
          horaDesde: '08:00',
          horaHasta: '10:00',
          ultimoEstado: [
            delDia('06:00'),
            delDia('08:30', { numeroTren: '03311' }),
            delDia('11:00'),
          ],
        }),
      ],
      AHORA,
    );
    expect(salida).toMatchObject({
      alertaId: 'a1',
      origenNombre: 'Madrid-Chamartín',
      destinoNombre: 'Barcelona-Sants',
      fecha: HOY,
      salida: '08:30',
      numeroTren: '03311',
      estado: 'plazas',
      precioMin: 45,
      intervaloSondeoMin: 10,
    });
    expect(salida?.salidaEn).toBe(Date.parse('2026-09-28T06:30:00Z'));
  });

  it('descarta las salidas que ya han salido', () => {
    const salida = proximaSalida([alerta({ ultimoEstado: [delDia('06:00')] })], AHORA);
    expect(salida).toMatchObject({ fecha: '2026-09-29', salida: null, estado: 'sin-datos' });
  });

  it('marca la salida cancelada', () => {
    const salida = proximaSalida(
      [
        alerta({
          ultimoEstado: [delDia('08:00', { cancelado: true }), delDia('09:00', { trenId: 't2' })],
        }),
      ],
      AHORA,
    );
    expect(salida).toMatchObject({ salida: '08:00', estado: 'cancelado', numeroTren: '03311' });
  });

  it('distingue completo, plazas y sin datos', () => {
    const completo = proximaSalida(
      [alerta({ ultimoEstado: [delDia('08:00', { disponible: false, precioMin: null })] })],
      AHORA,
    );
    expect(completo?.estado).toBe('completo');

    const sinPrecio = proximaSalida(
      [alerta({ ultimoEstado: [delDia('08:00', { precioMin: null })] })],
      AHORA,
    );
    expect(sinPrecio?.estado).toBe('plazas');
    expect(sinPrecio?.precioMin).toBeNull();

    const sinEstado = proximaSalida([alerta()], AHORA);
    expect(sinEstado).toMatchObject({ fecha: HOY, salida: null, salidaEn: null });
    expect(sinEstado?.estado).toBe('sin-datos');
  });

  it('las recurrentes solo laborables saltan el fin de semana', () => {
    const laborables = { recurrente: true, soloLaborables: true, fechaViaje: HOY };
    expect(aplicaEnFecha(laborables, SABADO_FECHA)).toBe(false);
    expect(aplicaEnFecha(laborables, '2026-09-27')).toBe(false);
    expect(aplicaEnFecha(laborables, HOY)).toBe(true);
    expect(proximaFechaAplicable(laborables, SABADO_FECHA)).toBe('2026-09-28');

    const salida = proximaSalida([alerta({ soloLaborables: true })], SABADO);
    expect(salida).toMatchObject({ fecha: '2026-09-28', salida: null, estado: 'sin-datos' });
  });

  it('las recurrentes sin soloLaborables también trabajan en fin de semana', () => {
    const salida = proximaSalida([alerta()], SABADO);
    expect(salida?.fecha).toBe(SABADO_FECHA);
    expect(
      proximaFechaAplicable(
        { recurrente: true, soloLaborables: false, fechaViaje: HOY },
        '2026-09-27',
      ),
    ).toBe('2026-09-27');
  });

  it('las puntuales solo valen en su fecha de viaje', () => {
    const futura = proximaSalida([alerta({ recurrente: false, fechaViaje: '2026-10-02' })], AHORA);
    expect(futura).toMatchObject({ fecha: '2026-10-02', salida: null, estado: 'sin-datos' });

    expect(
      proximaSalida([alerta({ recurrente: false, fechaViaje: '2026-09-27' })], AHORA),
    ).toBeNull();

    // Su único viaje de hoy ya ha salido: no hay próxima salida.
    expect(
      proximaSalida(
        [alerta({ recurrente: false, fechaViaje: HOY, ultimoEstado: [delDia('06:00')] })],
        AHORA,
      ),
    ).toBeNull();
  });

  it('respeta el tren concreto de una alerta puntual en fecha futura', () => {
    const salida = proximaSalida(
      [
        alerta({
          recurrente: false,
          fechaViaje: '2026-10-02',
          horaDesde: '07:00',
          ultimoEstado: [
            tren({ trenId: 'f1', salida: '2026-10-02T06:00:00.000Z' }),
            tren({ trenId: 'f2', salida: '2026-10-02T09:15:00.000Z', numeroTren: '04247' }),
          ],
        }),
      ],
      AHORA,
    );
    expect(salida).toMatchObject({
      fecha: '2026-10-02',
      salida: '09:15',
      numeroTren: '04247',
      estado: 'plazas',
    });
  });

  it('ignora las alertas que no están activas', () => {
    expect(proximaSalida([alerta({ estado: 'PAUSA' })], AHORA)).toBeNull();
    expect(proximaSalida([alerta({ estado: 'COMPLETADA' })], AHORA)).toBeNull();
    expect(proximaSalida([], AHORA)).toBeNull();
  });

  it('prefiere el tren conocido del mismo día a una salida sin hora', () => {
    const salida = proximaSalida(
      [
        alerta({ id: 'sin-hora' }),
        alerta({ id: 'con-tren', ultimoEstado: [delDia('09:00', { trenId: 't9' })] }),
      ],
      AHORA,
    );
    expect(salida?.alertaId).toBe('con-tren');
  });

  it('prefiere la salida de hoy a un tren conocido de otro día', () => {
    const salida = proximaSalida(
      [
        alerta({
          id: 'manana',
          ultimoEstado: [tren({ trenId: 'm1', salida: '2026-09-29T08:00:00.000Z' })],
        }),
        alerta({ id: 'hoy-sin-datos' }),
      ],
      AHORA,
    );
    expect(salida?.alertaId).toBe('hoy-sin-datos');
    expect(salida?.fecha).toBe(HOY);
  });

  it('elige la hora más temprana entre varias alertas', () => {
    const salida = proximaSalida(
      [
        alerta({ id: 'tarde', ultimoEstado: [delDia('18:00', { trenId: 't18' })] }),
        alerta({ id: 'temprana', ultimoEstado: [delDia('07:30', { trenId: 't730' })] }),
      ],
      AHORA,
    );
    expect(salida).toMatchObject({ alertaId: 'temprana', salida: '07:30' });
  });

  it('ignora los trenes fuera de la franja horaria', () => {
    const salida = proximaSalida(
      [alerta({ horaDesde: '12:00', ultimoEstado: [delDia('08:30')] })],
      AHORA,
    );
    expect(salida).toMatchObject({ fecha: HOY, salida: null, estado: 'sin-datos' });
  });

  it('tolera salidas guardadas solo como hora', () => {
    const salida = proximaSalida([alerta({ ultimoEstado: [tren({ salida: '20:15' })] })], AHORA);
    expect(salida).toMatchObject({ fecha: HOY, salida: '20:15' });
  });
});

describe('instantePeninsular', () => {
  it('aplica CEST en verano y CET en invierno', () => {
    expect(instantePeninsular('2026-09-28', '08:30')).toBe(Date.parse('2026-09-28T06:30:00Z'));
    expect(instantePeninsular('2026-01-15', '08:30')).toBe(Date.parse('2026-01-15T07:30:00Z'));
  });
});

describe('cuentaAtras', () => {
  it('describe horas y minutos restantes', () => {
    expect(cuentaAtras(5_400_000)).toBe('faltan 1 h 30 min');
    expect(cuentaAtras(3 * 3_600_000)).toBe('faltan 3 h');
    expect(cuentaAtras(45 * 60_000)).toBe('faltan 45 min');
  });

  it('agrupa en días cuando queda mucho', () => {
    expect(cuentaAtras(50 * 3_600_000)).toBe('faltan 2 d 2 h');
  });

  it('avisa de que ya ha salido o de que queda menos de un minuto', () => {
    expect(cuentaAtras(0)).toBe('ha salido');
    expect(cuentaAtras(-60_000)).toBe('ha salido');
    expect(cuentaAtras(30_000)).toBe('faltan menos de 1 min');
  });
});

describe('etiquetaDia', () => {
  it('etiqueta hoy, mañana, la semana y el resto', () => {
    expect(etiquetaDia(HOY, HOY)).toBe('Hoy');
    expect(etiquetaDia('2026-09-29', HOY)).toBe('Mañana');
    expect(etiquetaDia('2026-09-30', HOY)).toBe('miércoles 30');
    expect(etiquetaDia('2026-10-10', HOY)).toBe('10 oct');
  });
});

describe('textoPlazas y variantePlazas', () => {
  it('cubre cancelado, plazas con precio, completo y sin datos', () => {
    expect(textoPlazas({ estado: 'cancelado', precioMin: 45 })).toBe('Cancelado');
    expect(textoPlazas({ estado: 'plazas', precioMin: 45 })).toBe(
      `Hay plazas desde ${formatearPrecio(45)}`,
    );
    expect(textoPlazas({ estado: 'plazas', precioMin: null })).toBe('Hay plazas');
    expect(textoPlazas({ estado: 'completo', precioMin: null })).toBe('Completo');
    expect(textoPlazas({ estado: 'sin-datos', precioMin: null })).toBe('Sin datos de plazas aún');
  });

  it('mapea cada estado a su color de badge', () => {
    expect(variantePlazas('cancelado')).toBe('destructive');
    expect(variantePlazas('plazas')).toBe('exito');
    expect(variantePlazas('completo')).toBe('secondary');
    expect(variantePlazas('sin-datos')).toBe('outline');
  });
});
