import type { AlertaResponse, EstadoSerializado } from '@mantirenfe/shared-types';
import { beforeEach, describe, expect, it } from 'vitest';
import { cambiarIdioma } from '../i18n';
import { formatearPrecio } from './precios';
import {
  alertaAplicaHoy,
  calcularSalidasWidget,
  estadoSalidaWidget,
  etiquetaDia,
  fechaCorta,
  filtrarSalidasVigentes,
  MAX_SALIDAS_WIDGET,
  resumenWidget,
  retrasoWidget,
  type DatosWidget,
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
    diasSemana: [],
    fechaFlexible: false,
    fechaDesde: null,
    fechaHasta: null,
    intervaloSondeoMin: 10,
    bono: 'GENERAL',
    notas: null,
    ultimoSondeoEn: `${HOY}T09:00:00`,
    ultimoEstado: SONDEO,
    creadaEn: '2026-09-27T20:00:00Z',
    grupoId: null,
    ...parcial,
  };
}

// Fija el español: en CI el runner es en-US y el i18n arranca en 'en'.
beforeEach(async () => {
  await cambiarIdioma('es');
});

describe('alertaAplicaHoy', () => {
  it('compara la fecha de viaje con el día de hoy', () => {
    expect(alertaAplicaHoy(alerta(), HOY)).toBe(true);
    expect(alertaAplicaHoy(alerta({ fechaViaje: '2026-09-29' }), HOY)).toBe(false);
  });

  it('las recurrentes valen cada día, salvo los días no marcados', () => {
    const recurrente = alerta({ recurrente: true, fechaViaje: '2026-01-01' });
    expect(alertaAplicaHoy(recurrente, '2026-09-26')).toBe(true); // sábado

    const laborables = alerta({ recurrente: true, diasSemana: [1, 2, 3, 4, 5] });
    expect(alertaAplicaHoy(laborables, '2026-09-26')).toBe(false);
    expect(alertaAplicaHoy(laborables, HOY)).toBe(true);

    // 2026-10-01 es jueves: solo con el jueves marcado
    const jueves = alerta({ recurrente: true, diasSemana: [4] });
    expect(alertaAplicaHoy(jueves, '2026-10-01')).toBe(true);
    expect(alertaAplicaHoy(jueves, HOY)).toBe(false);

    // Flexible: el rango lo vigila el worker, el widget la considera siempre
    const flexible = alerta({ recurrente: false, fechaFlexible: true, fechaViaje: '2026-01-01' });
    expect(alertaAplicaHoy(flexible, '2026-09-26')).toBe(true);
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

  it('si la alerta es de mañana, muestra sus salidas etiquetadas como "mañana"', () => {
    const deManana: EstadoSerializado[] = [
      {
        trenId: 'm1',
        numeroTren: '09073',
        salida: '2026-09-29T07:00:00',
        disponible: true,
        precioMin: 12.7,
      },
    ];
    const datos = calcularSalidasWidget(
      [alerta({ fechaViaje: '2026-09-29', ultimoEstado: deManana })],
      AHORA,
    );

    expect(datos.fecha).toBe(HOY);
    expect(datos.salidas).toHaveLength(1);
    expect(datos.salidas[0]).toMatchObject({ salida: '07:00', fecha: '2026-09-29' });
    expect(etiquetaDia(datos.salidas[0]?.fecha ?? '', AHORA)).toBe('mañana');
  });

  it('si hoy no queda nada, mira hasta7 días y se queda en la primera fecha con salidas', () => {
    const delMiercoles: EstadoSerializado[] = [
      {
        trenId: 'w1',
        numeroTren: '12411',
        salida: '2026-09-30T05:30:00',
        disponible: true,
        precioMin: null,
      },
      {
        trenId: 'w2',
        numeroTren: '12421',
        salida: '2026-09-30T09:35:00',
        disponible: true,
        precioMin: null,
      },
      {
        trenId: 'w3',
        numeroTren: '12431',
        salida: '2026-09-30T15:39:00',
        disponible: true,
        precioMin: null,
      },
      {
        trenId: 'w4',
        numeroTren: '12441',
        salida: '2026-10-01T19:08:00',
        disponible: true,
        precioMin: null,
      },
    ];
    const datos = calcularSalidasWidget(
      [alerta({ recurrente: true, fechaViaje: '2026-01-01', ultimoEstado: delMiercoles })],
      AHORA,
    );

    expect(datos.salidas.map((s) => s.fecha)).toEqual(['2026-09-30', '2026-09-30', '2026-09-30']);
    expect(datos.salidas.map((s) => s.salida)).toEqual(['05:30', '09:35', '15:39']);
    expect(datos.salidas).toHaveLength(MAX_SALIDAS_WIDGET);
  });

  it('sin salidas en7 días guarda la próxima fecha de viaje', () => {
    const datos = calcularSalidasWidget(
      [alerta({ fechaViaje: '2026-10-03', ultimoEstado: null })],
      AHORA,
    );

    expect(datos.salidas).toHaveLength(0);
    expect(datos.proximoViaje).toBe('2026-10-03');
    expect(resumenWidget(datos, AHORA).vacio).toBe('Próximo viaje: 3 oct');
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

  it('conserva las salidas de días futuros al cruzar la medianoche', () => {
    const deManana: EstadoSerializado[] = [
      {
        trenId: 'm1',
        numeroTren: '09073',
        salida: '2026-09-29T07:00:00',
        disponible: true,
        precioMin: 12.7,
      },
    ];
    const datos = calcularSalidasWidget(
      [alerta({ fechaViaje: '2026-09-29', ultimoEstado: deManana })],
      AHORA,
    );
    const trasMedianoche = filtrarSalidasVigentes(datos, new Date(2026, 8, 29, 0, 5));

    expect(trasMedianoche.fecha).toBe('2026-09-29');
    expect(trasMedianoche.salidas.map((s) => s.salida)).toEqual(['07:00']);
  });
});

describe('etiquetaDia / fechaCorta', () => {
  it('hoy y fechas pasadas no llevan etiqueta', () => {
    expect(etiquetaDia('2026-09-28', AHORA)).toBeNull();
    expect(etiquetaDia('2026-09-27', AHORA)).toBeNull();
  });

  it('mañana y el resto con día de la semana', () => {
    expect(etiquetaDia('2026-09-29', AHORA)).toBe('mañana');
    expect(etiquetaDia('2026-09-30', AHORA)).toBe('miércoles 30');
    expect(etiquetaDia('2026-10-05', AHORA)).toBe('lunes 5');
  });

  it('resume la fecha como "3 oct"', () => {
    expect(fechaCorta('2026-10-03')).toBe('3 oct');
    expect(fechaCorta('2026-09-29')).toBe('29 sep');
  });
});

describe('resumenWidget (widget mini)', () => {
  it('devuelve la próxima salida: hora, tren y ruta', () => {
    const datos = calcularSalidasWidget([alerta()], AHORA);

    expect(resumenWidget(datos, AHORA)).toEqual({
      hora: '10:15',
      numeroTren: '01256A',
      ruta: 'Madrid-Chamartín → Valladolid-Campo Grande',
      dia: null,
      vacio: null,
    });
  });

  it('marca el día cuando la salida no es hoy', () => {
    const deManana: EstadoSerializado[] = [
      {
        trenId: 'm1',
        numeroTren: '09073',
        salida: '2026-09-29T07:00:00',
        disponible: true,
        precioMin: 12.7,
      },
    ];
    const datos = calcularSalidasWidget(
      [alerta({ fechaViaje: '2026-09-29', ultimoEstado: deManana })],
      AHORA,
    );

    expect(resumenWidget(datos, AHORA)).toMatchObject({
      hora: '07:00',
      dia: 'mañana',
      vacio: null,
    });
  });

  it('estado vacío: "Sin salidas" o el próximo viaje conocido', () => {
    expect(resumenWidget(null, AHORA).vacio).toBe('Sin salidas');
    expect(resumenWidget(calcularSalidasWidget([], AHORA), AHORA).vacio).toBe('Sin salidas');

    const conViaje = calcularSalidasWidget(
      [alerta({ fechaViaje: '2026-10-12', ultimoEstado: null })],
      AHORA,
    );
    expect(resumenWidget(conViaje, AHORA).vacio).toBe('Próximo viaje: 12 oct');
  });
});

describe('calcularSalidasWidget (estado del último sondeo)', () => {
  it('copia a cada salida disponible, precio, retraso y llegada', () => {
    const conEstado: EstadoSerializado[] = [
      {
        trenId: 't2',
        numeroTren: '01256A',
        salida: '2026-09-28T10:15:00',
        disponible: true,
        precioMin: 25,
        retrasoSeg: 600,
        horaLlegada: '12:30',
      },
      {
        trenId: 't3',
        numeroTren: '01290A',
        salida: '2026-09-28T14:45:00',
        disponible: false,
        precioMin: null,
        retrasoSeg: 0,
      },
    ];
    const datos = calcularSalidasWidget([alerta({ ultimoEstado: conEstado })], AHORA);

    expect(datos.salidas[0]).toMatchObject({
      numeroTren: '01256A',
      disponible: true,
      precioMin: 25,
      retrasoSeg: 600,
      horaLlegada: '12:30',
    });
    expect(datos.salidas[1]).toMatchObject({
      numeroTren: '01290A',
      disponible: false,
      precioMin: null,
      retrasoSeg: 0,
    });
    expect(datos.salidas[1]?.horaLlegada).toBeUndefined();
  });

  it('conserva el estado al filtrar las salidas vigentes', () => {
    const datos = calcularSalidasWidget([alerta()], AHORA);
    const vigentes = filtrarSalidasVigentes(datos, new Date(2026, 8, 28, 11, 0));

    expect(vigentes.salidas.map((s) => s.salida)).toEqual(['14:45']);
    expect(vigentes.salidas[0]).toMatchObject({ disponible: false, precioMin: null });
  });

  it('una caché sin campos de estado sigue pintando la salida', () => {
    const antigua: DatosWidget = {
      fecha: HOY,
      actualizadoEn: AHORA.toISOString(),
      salidas: [
        {
          numeroTren: '01256A',
          origen: 'Madrid-Chamartín',
          destino: 'Valladolid-Campo Grande',
          salida: '10:15',
          salidaIso: `${HOY}T10:15:00`,
        },
      ],
    };
    const vigentes = filtrarSalidasVigentes(antigua, AHORA);

    expect(vigentes.salidas).toHaveLength(1);
    expect(estadoSalidaWidget(vigentes.salidas[0])).toEqual({ texto: '—', tono: 'sinDatos' });
    expect(retrasoWidget(vigentes.salidas[0])).toBeNull();
    expect(resumenWidget(vigentes, AHORA)).toMatchObject({ hora: '10:15', vacio: null });
  });
});

describe('estadoSalidaWidget', () => {
  it('cancelado en rojo, completo en gris y plazas en verde', () => {
    expect(estadoSalidaWidget({ cancelado: true, disponible: true, precioMin: 32 })).toEqual({
      texto: 'Cancelado',
      tono: 'error',
    });
    expect(estadoSalidaWidget({ disponible: false, precioMin: null })).toEqual({
      texto: 'Completo',
      tono: 'neutro',
    });
    expect(estadoSalidaWidget({ disponible: true, precioMin: null })).toEqual({
      texto: 'Hay plazas',
      tono: 'exito',
    });
    expect(estadoSalidaWidget({ disponible: true, precioMin: 32.5 })).toEqual({
      texto: `Plazas desde ${formatearPrecio(32.5)}`,
      tono: 'exito',
    });
  });

  it('usa el sondeo de la salida calculada', () => {
    const datos = calcularSalidasWidget([alerta()], AHORA);

    expect(estadoSalidaWidget(datos.salidas[0])).toEqual({
      texto: `Plazas desde ${formatearPrecio(25)}`,
      tono: 'exito',
    });
    expect(estadoSalidaWidget(datos.salidas[1])).toEqual({ texto: 'Completo', tono: 'neutro' });
  });

  it('la variante corta del mini es más breve', () => {
    expect(estadoSalidaWidget({ disponible: true, precioMin: 32.5 }, { corto: true })).toEqual({
      texto: `Plazas ${formatearPrecio(32.5)}`,
      tono: 'exito',
    });
  });

  it('sin datos de estado (caché antigua) devuelve «—»', () => {
    expect(estadoSalidaWidget({})).toEqual({ texto: '—', tono: 'sinDatos' });
    expect(estadoSalidaWidget(null)).toEqual({ texto: '—', tono: 'sinDatos' });
    expect(estadoSalidaWidget(undefined)).toEqual({ texto: '—', tono: 'sinDatos' });
  });
});

describe('retrasoWidget', () => {
  it('solo enseña el retraso a partir de 5 minutos', () => {
    expect(retrasoWidget({ retrasoSeg: null })).toBeNull();
    expect(retrasoWidget({ retrasoSeg: 120 })).toBeNull();
    expect(retrasoWidget({})).toBeNull();
    expect(retrasoWidget(undefined)).toBeNull();
    expect(retrasoWidget({ retrasoSeg: 300 })).toBe(5);
    expect(retrasoWidget({ retrasoSeg: 420 })).toBe(7);
  });
});
