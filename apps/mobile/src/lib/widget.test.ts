import type { AlertaResponse, EstadoSerializado } from '@mantirenfe/shared-types';
import { describe, expect, it } from 'vitest';
import {
  alertaAplicaHoy,
  calcularSalidasWidget,
  filtrarSalidasVigentes,
  MAX_SALIDAS_WIDGET,
} from './widget';

const AHORA = new Date(2026, 8, 28, 9, 30); // lunes 28-09-2026, 09:30 (hora local)

const HOY = '2026-09-28';

const SONDEO: EstadoSerializado[] = [
  {
    trenId: 't1',
    numeroTren: '01234A',
    salida: '2026-09-28T08:00:00',
    disponible: true,
    precioMin: 20,
  },
  {
    trenId: 't2',
    numeroTren: '01256A',
    salida: '2026-09-28T10:15:00',
    disponible: true,
    precioMin: 25,
  },
  {
    trenId: 't3',
    numeroTren: '01290A',
    salida: '2026-09-28T14:45:00',
    disponible: false,
    precioMin: null,
  },
];

function alerta(parcial: Partial<AlertaResponse> = {}): AlertaResponse {
  return {
    id: 'a1',
    origenNombre: 'Madrid-Chamartín',
    destinoNombre: 'Valladolid-Campo Grande',
    fechaViaje: HOY,
    horaDesde: null,
    horaHasta: null,
    numeroTren: null,
    criterio: 'DISPONIBILIDAD',
    precioObjetivo: null,
    estado: 'ACTIVA',
    recurrente: false,
    soloLaborables: false,
    intervaloSondeoMin: 10,
    bono: 'GENERAL',
    notas: null,
    ultimoSondeoEn: `${HOY}T09:00:00`,
    ultimoEstado: SONDEO,
    creadaEn: '2026-09-27T20:00:00Z',
    ...parcial,
  };
}

describe('alertaAplicaHoy', () => {
  it('compara la fecha de viaje con el día de hoy', () => {
    expect(alertaAplicaHoy(alerta(), HOY)).toBe(true);
    expect(alertaAplicaHoy(alerta({ fechaViaje: '2026-09-29' }), HOY)).toBe(false);
  });

  it('las recurrentes valen cada día, salvo soloLaborables en fin de semana', () => {
    const recurrente = alerta({ recurrente: true, fechaViaje: '2026-01-01' });
    expect(alertaAplicaHoy(recurrente, '2026-09-26')).toBe(true); // sábado

    const laborables = alerta({ recurrente: true, soloLaborables: true });
    expect(alertaAplicaHoy(laborables, '2026-09-26')).toBe(false);
    expect(alertaAplicaHoy(laborables, HOY)).toBe(true);
  });
});

describe('calcularSalidasWidget', () => {
  it('toma las próximas salidas de hoy de cada alerta activa', () => {
    const datos = calcularSalidasWidget([alerta()], AHORA);

    expect(datos.fecha).toBe(HOY);
    expect(datos.salidas.map((s) => s.salida)).toEqual(['10:15', '14:45']);
    expect(datos.salidas[0]).toMatchObject({
      numeroTren: '01256A',
      salida: '10:15',
      origen: 'Madrid-Chamartín',
      destino: 'Valladolid-Campo Grande',
    });
  });

  it('ignora alertas pausadas, completadas o de otro día', () => {
    const datos = calcularSalidasWidget(
      [
        alerta({ estado: 'PAUSA' }),
        alerta({ estado: 'COMPLETADA' }),
        alerta({ fechaViaje: '2026-09-29' }),
        alerta({ ultimoEstado: null }),
      ],
      AHORA,
    );

    expect(datos.salidas).toHaveLength(0);
  });

  it('respeta la ventana de horas de la alerta', () => {
    expect(calcularSalidasWidget([alerta({ horaDesde: '11:00' })], AHORA).salidas[0]?.salida).toBe(
      '14:45',
    );
    expect(calcularSalidasWidget([alerta({ horaHasta: '09:00' })], AHORA).salidas).toHaveLength(0);
  });

  it('descarta trenes cancelados', () => {
    const cancelado: EstadoSerializado[] = SONDEO.map((t) =>
      t.trenId === 't2' ? { ...t, cancelado: true } : t,
    );
    const datos = calcularSalidasWidget([alerta({ ultimoEstado: cancelado })], AHORA);

    expect(datos.salidas[0]?.salida).toBe('14:45');
  });

  it('ordena, deduplica y limita las salidas', () => {
    const datos = calcularSalidasWidget(
      [
        alerta({ id: 'a1' }),
        alerta({ id: 'a2' }), // misma ruta y tren: no debe duplicarse
        alerta({
          id: 'a3',
          origenNombre: 'Madrid-Atocha',
          destinoNombre: 'Barcelona-Sants',
          ultimoEstado: [
            {
              trenId: 't9',
              numeroTren: '09876B',
              salida: '2026-09-28T11:00:00',
              disponible: true,
              precioMin: 30,
            },
          ],
        }),
        alerta({
          id: 'a4',
          origenNombre: 'Segovia',
          destinoNombre: 'León',
          ultimoEstado: [
            {
              trenId: 't8',
              numeroTren: '05555C',
              salida: '2026-09-28T12:30:00',
              disponible: true,
              precioMin: 15,
            },
          ],
        }),
        alerta({
          id: 'a5',
          origenNombre: 'Ávila',
          destinoNombre: 'Salamanca',
          ultimoEstado: [
            {
              trenId: 't7',
              numeroTren: '04444D',
              salida: '2026-09-28T13:00:00',
              disponible: true,
              precioMin: 12,
            },
          ],
        }),
      ],
      AHORA,
    );

    expect(datos.salidas.map((s) => s.salida)).toEqual(['10:15', '11:00', '12:30']);
    expect(datos.salidas).toHaveLength(MAX_SALIDAS_WIDGET);
  });
});

describe('filtrarSalidasVigentes', () => {
  it('quita las salidas que ya han pasado', () => {
    const datos = calcularSalidasWidget([alerta()], AHORA);
    const despues = filtrarSalidasVigentes(datos, new Date(2026, 8, 28, 11, 0));

    expect(despues.salidas.map((s) => s.salida)).toEqual(['14:45']);
  });

  it('vacía los datos si son de otro día', () => {
    const datos = calcularSalidasWidget([alerta()], AHORA);
    const manana = filtrarSalidasVigentes(datos, new Date(2026, 8, 29, 8, 0));

    expect(manana.fecha).toBe('2026-09-29');
    expect(manana.salidas).toHaveLength(0);
  });
});
