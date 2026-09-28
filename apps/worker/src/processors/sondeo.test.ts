import { describe, expect, it } from 'vitest';
import type { EstadoDisponibilidad, EstadoSerializado } from '@mantirenfe/shared-types';
import {
  diffDisponibles,
  diffHorarios,
  enFranjaHoraria,
  filtrarBajoObjetivo,
  filtrarCambiosPrecio,
  filtrarCancelados,
  filtrarRetrasados,
  nuevasParadasSuprimidas,
  nuevosBajoObjetivo,
  nuevosCancelados,
  pushHabilitado,
  serializarEstado,
  textoCancelacion,
  textoIndemnizacion,
  textoParadaSuprimida,
  textoPrecioBajo,
} from './sondeo';

function estado(trenes: EstadoDisponibilidad['trenes']): EstadoDisponibilidad {
  return {
    consulta: {
      origenNombre: 'Madrid',
      destinoNombre: 'Sevilla',
      fecha: '2026-10-01',
    },
    trenes,
    consultadoEn: new Date().toISOString(),
  };
}

function serie(
  trenes: Array<Partial<EstadoSerializado> & { trenId: string }>,
): EstadoSerializado[] {
  return trenes.map((t) => ({
    numeroTren: '1',
    salida: '08:00',
    disponible: true,
    precioMin: null,
    ...t,
  }));
}

describe('serializarEstado', () => {
  it('ordena por trenId e incluye retraso', () => {
    const serie = serializarEstado(
      estado([
        {
          trenId: 'b',
          numeroTren: '2',
          salida: '10:00',
          disponible: true,
          precioMin: 20,
          moneda: 'EUR',
          retrasoSeg: 600,
        },
        {
          trenId: 'a',
          numeroTren: '1',
          salida: '08:00',
          disponible: false,
          precioMin: null,
          moneda: 'EUR',
        },
      ]),
    );
    expect(serie.map((t) => t.trenId)).toEqual(['a', 'b']);
    expect(serie[1]?.retrasoSeg).toBe(600);
    expect(serie[0]?.retrasoSeg).toBeNull();
  });

  it('serializa la marca de cancelación como booleano', () => {
    const serie = serializarEstado(
      estado([
        {
          trenId: 'a',
          numeroTren: '15648',
          salida: '2026-09-27T06:00:00.000Z',
          disponible: true,
          precioMin: null,
          moneda: 'EUR',
          cancelado: true,
        },
        {
          trenId: 'b',
          numeroTren: '04193',
          salida: '2026-09-27T07:00:00.000Z',
          disponible: true,
          precioMin: null,
          moneda: 'EUR',
        },
      ]),
    );
    expect(serie.map((t) => t.cancelado)).toEqual([true, false]);
  });
});

describe('filtrarCancelados y nuevosCancelados', () => {
  const horario = (trenId: string, cancelado?: boolean) =>
    ({
      trenId,
      numeroTren: trenId,
      salida: '2026-09-27T06:00:00.000Z',
      disponible: true,
      precioMin: null,
      retrasoSeg: null,
      cancelado,
    }) as EstadoSerializado;

  it('solo devuelve los trenes cancelados', () => {
    const actual = [horario('t1', true), horario('t2'), horario('t3', false)];
    expect(filtrarCancelados(actual).map((t) => t.trenId)).toEqual(['t1']);
  });

  it('solo considera nueva la cancelación que no estaba antes', () => {
    const actual = [horario('t1', true), horario('t2', true)];
    const anterior = [horario('t1', true), horario('t2')];
    expect(nuevosCancelados(anterior, actual).map((t) => t.trenId)).toEqual(['t2']);
  });

  it('sin cancelación previa en el estado guardado notifica todas', () => {
    const actual = [horario('t1', true)];
    expect(nuevosCancelados([], actual).map((t) => t.trenId)).toEqual(['t1']);
    expect(nuevosCancelados([horario('t1')], actual).map((t) => t.trenId)).toEqual(['t1']);
  });

  it('no devuelve nada si nadie está cancelado', () => {
    expect(nuevosCancelados([horario('t1')], [horario('t1', false)])).toEqual([]);
  });
});

describe('paradas suprimidas (SKIPPED)', () => {
  const horario = (trenId: string, estaciones?: string[]) =>
    ({
      trenId,
      numeroTren: trenId,
      salida: '2026-09-27T06:00:00.000Z',
      disponible: true,
      precioMin: null,
      retrasoSeg: null,
      cancelado: false,
      ...(estaciones && estaciones.length > 0 ? { paradasSuprimidas: estaciones } : {}),
    }) as EstadoSerializado;

  it('serializa las estaciones suprimidas y omite el campo si no hay', () => {
    const serie = serializarEstado(
      estado([
        {
          trenId: '2068D70773C6',
          numeroTren: '2068D70773C6',
          salida: '2026-09-27T06:00:00.000Z',
          disponible: true,
          precioMin: null,
          moneda: 'EUR',
          paradasSuprimidas: ['Oviedo'],
        },
        {
          trenId: '2068D22233C2',
          numeroTren: '2068D22233C2',
          salida: '2026-09-27T07:00:00.000Z',
          disponible: true,
          precioMin: null,
          moneda: 'EUR',
        },
      ]),
    );
    const conSupresion = serie.find((t) => t.trenId === '2068D70773C6');
    const sinSupresion = serie.find((t) => t.trenId === '2068D22233C2');
    expect(conSupresion?.paradasSuprimidas).toEqual(['Oviedo']);
    expect(sinSupresion).not.toHaveProperty('paradasSuprimidas');
  });

  it('solo considera nuevas las estaciones que no estaban en el estado anterior', () => {
    const anterior = [horario('t1', ['Oviedo'])];
    const actual = [horario('t1', ['Oviedo']), horario('t2', ['Gijón-Sanz Crespo'])];
    const detectadas = nuevasParadasSuprimidas(anterior, actual);
    expect(detectadas.map((d) => [d.tren.trenId, d.estaciones])).toEqual([
      ['t2', ['Gijón-Sanz Crespo']],
    ]);
  });

  it('no repite la supresión si sigue igual en el siguiente sondeo', () => {
    const anterior = [horario('t1', ['Oviedo', 'Avilés'])];
    expect(nuevasParadasSuprimidas(anterior, [horario('t1', ['Oviedo', 'Avilés'])])).toEqual([]);
  });

  it('avisa solo de la estación recién suprimida', () => {
    const anterior = [horario('t1', ['Oviedo'])];
    const actual = [horario('t1', ['Oviedo', 'Avilés'])];
    const detectadas = nuevasParadasSuprimidas(anterior, actual);
    expect(detectadas).toHaveLength(1);
    expect(detectadas[0]?.estaciones).toEqual(['Avilés']);
  });

  it('notifica todas las estaciones de un tren nuevo', () => {
    const detectadas = nuevasParadasSuprimidas([], [horario('t1', ['Oviedo', 'Avilés'])]);
    expect(detectadas[0]?.estaciones).toEqual(['Oviedo', 'Avilés']);
  });

  it('sin paradas suprimidas no detecta nada', () => {
    expect(nuevasParadasSuprimidas([horario('t1')], [horario('t1')])).toEqual([]);
  });
});

describe('textoCancelacion', () => {
  it('indica hora y número de tren', () => {
    expect(
      textoCancelacion({
        trenId: '15648',
        numeroTren: '15648',
        salida: '2026-09-27T06:35:00.000Z',
        disponible: true,
        precioMin: null,
        cancelado: true,
      }),
    ).toBe('Tu tren de las 06:35 (15648) está cancelado hoy');
  });

  it('usa el trenId si no hay número de tren', () => {
    expect(
      textoCancelacion({
        trenId: '3065J23574C1',
        numeroTren: '',
        salida: '08:10',
        disponible: true,
        precioMin: null,
        cancelado: true,
      }),
    ).toBe('Tu tren de las 08:10 (3065J23574C1) está cancelado hoy');
  });
});

describe('textoParadaSuprimida', () => {
  it('indica hora, número de tren y estación', () => {
    expect(
      textoParadaSuprimida(
        {
          trenId: '2068D70773C6',
          numeroTren: '2068D70773C6',
          salida: '2026-09-27T06:35:00.000Z',
          disponible: true,
          precioMin: null,
          paradasSuprimidas: ['Oviedo'],
        },
        'Oviedo',
      ),
    ).toBe('Tu tren de las 06:35 (2068D70773C6) no para hoy en Oviedo');
  });

  it('usa el trenId si no hay número de tren', () => {
    expect(
      textoParadaSuprimida(
        {
          trenId: '3065J23574C1',
          numeroTren: '',
          salida: '08:10',
          disponible: true,
          precioMin: null,
        },
        'Córdoba',
      ),
    ).toBe('Tu tren de las 08:10 (3065J23574C1) no para hoy en Córdoba');
  });
});

describe('diffDisponibles', () => {
  it('detecta un tren que pasa de no disponible a disponible', () => {
    const anterior = serializarEstado(
      estado([
        {
          trenId: 't1',
          numeroTren: '1',
          salida: '08:00',
          disponible: false,
          precioMin: null,
          moneda: 'EUR',
        },
        {
          trenId: 't2',
          numeroTren: '2',
          salida: '10:00',
          disponible: true,
          precioMin: 15,
          moneda: 'EUR',
        },
      ]),
    );
    const actual = serializarEstado(
      estado([
        {
          trenId: 't1',
          numeroTren: '1',
          salida: '08:00',
          disponible: true,
          precioMin: 15,
          moneda: 'EUR',
        },
        {
          trenId: 't2',
          numeroTren: '2',
          salida: '10:00',
          disponible: true,
          precioMin: 15,
          moneda: 'EUR',
        },
      ]),
    );

    const { aparecen } = diffDisponibles(anterior, actual);
    expect(aparecen.map((t) => t.trenId)).toEqual(['t1']);
  });
});

describe('diffHorarios', () => {
  it('detecta salidas nuevas, retiradas y horas cambiadas', () => {
    const anterior = serializarEstado(
      estado([
        {
          trenId: 't1',
          numeroTren: '1',
          salida: '08:00',
          disponible: true,
          precioMin: null,
          moneda: 'EUR',
        },
        {
          trenId: 't2',
          numeroTren: '2',
          salida: '10:00',
          disponible: true,
          precioMin: null,
          moneda: 'EUR',
        },
      ]),
    );
    const actual = serializarEstado(
      estado([
        {
          trenId: 't1',
          numeroTren: '1',
          salida: '08:15',
          disponible: true,
          precioMin: null,
          moneda: 'EUR',
        },
        {
          trenId: 't3',
          numeroTren: '3',
          salida: '12:00',
          disponible: true,
          precioMin: null,
          moneda: 'EUR',
        },
      ]),
    );

    const { nuevos, salidos, cambiados } = diffHorarios(anterior, actual);
    expect(nuevos.map((t) => t.trenId)).toEqual(['t3']);
    expect(salidos.map((t) => t.trenId)).toEqual(['t2']);
    expect(cambiados.map((t) => t.trenId)).toEqual(['t1']);
  });
});

describe('filtrarRetrasados', () => {
  it('solo devuelve trenes sobre el umbral', () => {
    const actual = serializarEstado(
      estado([
        {
          trenId: 't1',
          numeroTren: '1',
          salida: '08:00',
          disponible: true,
          precioMin: null,
          moneda: 'EUR',
          retrasoSeg: 600,
        },
        {
          trenId: 't2',
          numeroTren: '2',
          salida: '09:00',
          disponible: true,
          precioMin: null,
          moneda: 'EUR',
          retrasoSeg: 60,
        },
        {
          trenId: 't3',
          numeroTren: '3',
          salida: '10:00',
          disponible: true,
          precioMin: null,
          moneda: 'EUR',
        },
      ]),
    );
    expect(filtrarRetrasados(actual, 300).map((t) => t.trenId)).toEqual(['t1']);
  });
});

describe('pushHabilitado', () => {
  it('activo por defecto y en objeto/string salvo que la preferencia esté en false', () => {
    expect(pushHabilitado(undefined)).toBe(true);
    expect(pushHabilitado(null)).toBe(true);
    expect(pushHabilitado({})).toBe(true);
    expect(pushHabilitado({ notificacionesPush: true })).toBe(true);
    expect(pushHabilitado({ notificacionesPush: false })).toBe(false);
    expect(pushHabilitado('{"notificacionesPush":false}')).toBe(false);
    expect(pushHabilitado('{"notificacionesPush":true}')).toBe(true);
    expect(pushHabilitado('{no es json')).toBe(true);
  });
});

describe('textoIndemnizacion', () => {
  it('sin aviso por debajo del umbral principal (60 min)', () => {
    expect(textoIndemnizacion(0)).toBe('');
    expect(textoIndemnizacion(300)).toBe('');
    expect(textoIndemnizacion(59 * 60)).toBe('');
  });

  it('avisa a partir de 60 min de retraso con el rango 50-100%', () => {
    const aviso = textoIndemnizacion(60 * 60);
    expect(aviso).toContain('indemnización');
    expect(aviso).toContain('50-100%');
    expect(textoIndemnizacion(95 * 60)).toBe(aviso);
  });

  it('ignora valores no válidos', () => {
    expect(textoIndemnizacion(-1)).toBe('');
    expect(textoIndemnizacion(Number.NaN)).toBe('');
  });
});

describe('enFranjaHoraria', () => {
  it('sin franja todo vale', () => {
    expect(enFranjaHoraria('2026-09-26T06:00:00.000Z', null, null)).toBe(true);
  });

  it('filtra por HH:MM con salidas ISO y sueltas', () => {
    expect(enFranjaHoraria('2026-09-26T17:30:00.000Z', '17:00', '19:00')).toBe(true);
    expect(enFranjaHoraria('17:00', '17:00', '19:00')).toBe(true);
    expect(enFranjaHoraria('19:00', '17:00', '19:00')).toBe(true);
    expect(enFranjaHoraria('2026-09-26T06:00:00.000Z', '17:00', '19:00')).toBe(false);
    expect(enFranjaHoraria('20:01', '17:00', '19:00')).toBe(false);
  });

  it('respeta solo desde o solo hasta', () => {
    expect(enFranjaHoraria('08:00', '07:00', null)).toBe(true);
    expect(enFranjaHoraria('06:00', '07:00', null)).toBe(false);
    expect(enFranjaHoraria('22:00', null, '23:00')).toBe(true);
    expect(enFranjaHoraria('23:30', null, '23:00')).toBe(false);
  });
});

describe('filtrarCambiosPrecio (registro del histórico)', () => {
  it('en el primer sondeo registra todos los trenes', () => {
    const actual = serie([
      { trenId: 't1', precioMin: 20 },
      { trenId: 't2', precioMin: 35, disponible: false },
    ]);
    expect(filtrarCambiosPrecio([], actual, true)).toEqual(actual);
  });

  it('sin cambios de precio ni disponibilidad no registra nada', () => {
    const sinCambios = serie([
      { trenId: 't1', precioMin: 20 },
      { trenId: 't2', precioMin: 35, disponible: false },
    ]);
    expect(filtrarCambiosPrecio(sinCambios, sinCambios, false)).toEqual([]);
  });

  it('registra solo el tren cuyo precio cambió', () => {
    const anterior = serie([
      { trenId: 't1', precioMin: 45 },
      { trenId: 't2', precioMin: 35 },
    ]);
    const actual = serie([
      { trenId: 't1', precioMin: 40 },
      { trenId: 't2', precioMin: 35 },
    ]);
    const cambios = filtrarCambiosPrecio(anterior, actual, false);
    expect(cambios.map((t) => t.trenId)).toEqual(['t1']);
    expect(cambios[0]?.precioMin).toBe(40);
  });

  it('registra el cambio de disponibilidad aunque el precio no varíe', () => {
    const anterior = serie([{ trenId: 't1', precioMin: 20, disponible: false }]);
    const actual = serie([{ trenId: 't1', precioMin: 20, disponible: true }]);
    expect(filtrarCambiosPrecio(anterior, actual, false).map((t) => t.trenId)).toEqual(['t1']);
  });

  it('registra un tren nuevo (entrada en venta) e ignora los retirados', () => {
    const anterior = serie([
      { trenId: 't1', precioMin: 20 },
      { trenId: 'viejo', precioMin: 20 },
    ]);
    const actual = serie([
      { trenId: 't1', precioMin: 20 },
      { trenId: 'nuevo', precioMin: 18 },
    ]);
    expect(filtrarCambiosPrecio(anterior, actual, false).map((t) => t.trenId)).toEqual(['nuevo']);
  });

  it('considera cambio el paso a precio desconocido (null)', () => {
    const anterior = serie([{ trenId: 't1', precioMin: 20 }]);
    const actual = serie([{ trenId: 't1', precioMin: null }]);
    expect(filtrarCambiosPrecio(anterior, actual, false)).toHaveLength(1);
  });
});

describe('filtrarBajoObjetivo y nuevosBajoObjetivo (criterio PRECIO)', () => {
  it('señala los trenes con precio conocido menor o igual que el objetivo', () => {
    const actual = serie([
      { trenId: 't1', precioMin: 25 },
      { trenId: 't2', precioMin: 30 },
      { trenId: 't3', precioMin: 45 },
      { trenId: 't4', precioMin: null },
    ]);
    expect(filtrarBajoObjetivo(actual, 30).map((t) => t.trenId)).toEqual(['t1', 't2']);
    expect(nuevosBajoObjetivo([], actual, 30).map((t) => t.trenId)).toEqual(['t1', 't2']);
  });

  it('no repite el aviso mientras el tren siga por debajo del objetivo', () => {
    const barato = serie([{ trenId: 't1', precioMin: 25 }]);
    expect(nuevosBajoObjetivo(barato, barato, 30)).toEqual([]);
  });

  it('vuelve a avisar si el precio sube y luego vuelve a entrar en el umbral', () => {
    const baratoAntes = serie([{ trenId: 't1', precioMin: 25 }]);
    const caro = serie([{ trenId: 't1', precioMin: 40 }]);
    const baratoDespues = serie([{ trenId: 't1', precioMin: 30 }]);
    expect(nuevosBajoObjetivo(baratoAntes, caro, 30)).toEqual([]);
    const detectados = nuevosBajoObjetivo(caro, baratoDespues, 30);
    expect(detectados.map((t) => t.trenId)).toEqual(['t1']);
    expect(detectados[0]?.precioMin).toBe(30);
  });

  it('un tren nuevo que ya es barato entra en el primer diff', () => {
    const anterior = serie([{ trenId: 'viejo', precioMin: 90 }]);
    const actual = serie([
      { trenId: 'viejo', precioMin: 90 },
      { trenId: 'nuevo', precioMin: 12 },
    ]);
    expect(nuevosBajoObjetivo(anterior, actual, 30).map((t) => t.trenId)).toEqual(['nuevo']);
  });

  it('sin precio conocido, sin objetivo o con objetivo inválido no detecta nada', () => {
    const conPrecio = serie([{ trenId: 't1', precioMin: 10 }]);
    const sinPrecio = serie([{ trenId: 't1', precioMin: null }]);
    expect(nuevosBajoObjetivo([], sinPrecio, 30)).toEqual([]);
    expect(nuevosBajoObjetivo([], conPrecio, null)).toEqual([]);
    expect(nuevosBajoObjetivo([], conPrecio, undefined)).toEqual([]);
    expect(nuevosBajoObjetivo([], conPrecio, Number.NaN)).toEqual([]);
    expect(filtrarBajoObjetivo(conPrecio, null)).toEqual([]);
  });
});

describe('textoPrecioBajo', () => {
  it('indica tren, hora de salida, precio y objetivo', () => {
    expect(
      textoPrecioBajo(
        {
          trenId: '15648',
          numeroTren: '15648',
          salida: '2026-09-27T06:35:00.000Z',
          disponible: true,
          precioMin: 24.5,
          cancelado: false,
        },
        30,
      ),
    ).toBe('Precio: 15648 06:35 a 24,5 € (objetivo ≤ 30 €)');
  });

  it('usa el trenId si no hay número de tren y formatea decimales', () => {
    expect(
      textoPrecioBajo(
        {
          trenId: '3065J23574C1',
          numeroTren: '',
          salida: '08:10',
          disponible: true,
          precioMin: 42,
        },
        42.9,
      ),
    ).toBe('Precio: 3065J23574C1 08:10 a 42 € (objetivo ≤ 42,9 €)');
  });
});
