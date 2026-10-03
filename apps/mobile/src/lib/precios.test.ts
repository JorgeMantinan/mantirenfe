import { beforeEach, describe, expect, it } from 'vitest';
import { cambiarIdioma } from '../i18n';
import type { PuntoPrecio } from '@mantirenfe/shared-types';
import {
  agruparContagos,
  agruparPrecios,
  anchoBarra,
  consejoPrecio,
  esSeriePlana,
  formatearPrecio,
  MAX_GRUPOS_GRAFICA,
  recortarContagos,
  textoSerieCompacta,
  textoSondeosOcultos,
} from './precios';

function punto(minutos: number, extra: Partial<PuntoPrecio> = {}): PuntoPrecio {
  return {
    numeroTren: '03311',
    salida: '08:00',
    precioMin: 45,
    disponible: true,
    registradoEn: new Date(Date.UTC(2026, 8, 1, 8, minutos)).toISOString(),
    ...extra,
  };
}

/** `tramos` bloques de `porTramo` sondeos, cada bloque con un precio distinto. */
function contagosEnTramos(tramos: number, porTramo: number): ReturnType<typeof agruparContagos> {
  const puntos: PuntoPrecio[] = [];
  for (let t = 0; t < tramos; t += 1) {
    for (let i = 0; i < porTramo; i += 1) {
      puntos.push(punto(t * 10 + i, { precioMin: 30 + t }));
    }
  }
  return agruparContagos(puntos);
}

// Fija el espanol: en CI el runner es en-US y el i18n arranca en 'en'.
beforeEach(async () => {
  await cambiarIdioma('es');
});

describe('agruparPrecios', () => {
  it('agrupa por numeroTren + salida y calcula min/max', () => {
    const series = agruparPrecios([
      punto(0, { precioMin: 45 }),
      punto(10, { precioMin: 40 }),
      punto(20, { salida: '10:00', precioMin: 60 }),
      punto(30, { numeroTren: '03312', precioMin: 30 }),
    ]);
    expect(series).toHaveLength(3);
    expect(series[0]?.clave).toBe('03311|08:00');
    expect(series[0]?.puntos).toHaveLength(2);
    expect(series[0]?.minimo).toBe(40);
    expect(series[0]?.maximo).toBe(45);
  });

  it('ignora los puntos sin precio para el rango', () => {
    const series = agruparPrecios([punto(0, { precioMin: null }), punto(10, { precioMin: 50 })]);
    expect(series[0]?.minimo).toBe(50);
    expect(series[0]?.maximo).toBe(50);
    expect(series[0]?.puntos).toHaveLength(2);
  });

  it('devuelve vacío sin puntos', () => {
    expect(agruparPrecios([])).toEqual([]);
  });
});

describe('agruparContagos', () => {
  it('une los puntos consecutivos con el mismo precio en un grupo', () => {
    const contagos = agruparContagos([
      punto(0, { precioMin: 38 }),
      punto(10, { precioMin: 38 }),
      punto(20, { precioMin: 38 }),
      punto(30, { precioMin: 45 }),
      punto(40, { precioMin: 45 }),
    ]);
    expect(contagos).toHaveLength(2);
    expect(contagos[0]).toMatchObject({ precioMin: 38, cantidad: 3 });
    expect(contagos[1]).toMatchObject({ precioMin: 45, cantidad: 2 });
  });

  it('cada cambio de precio corta la agrupación', () => {
    const contagos = agruparContagos([
      punto(0, { precioMin: 45 }),
      punto(10, { precioMin: 40 }),
      punto(20, { precioMin: 45 }),
    ]);
    expect(contagos.map((grupo) => grupo.precioMin)).toEqual([45, 40, 45]);
    expect(contagos.map((grupo) => grupo.cantidad)).toEqual([1, 1, 1]);
  });

  it('conserva los campos del primer punto del tramo', () => {
    const contagos = agruparContagos([
      punto(0, { precioMin: 38, disponible: true }),
      punto(10, { precioMin: 38, disponible: false }),
    ]);
    expect(contagos).toHaveLength(1);
    expect(contagos[0]?.disponible).toBe(true);
    expect(contagos[0]?.salida).toBe('08:00');
    expect(contagos[0]?.registradoEn).toBe(punto(0).registradoEn);
    expect(contagos[0]?.cantidad).toBe(2);
  });

  it('devuelve vacío sin puntos', () => {
    expect(agruparContagos([])).toEqual([]);
  });
});

describe('esSeriePlana', () => {
  it('es plana cuando todo el rango mantiene el mismo precio', () => {
    expect(esSeriePlana([punto(0), punto(10), punto(20)])).toBe(true);
    expect(esSeriePlana([punto(0)])).toBe(true);
  });

  it('deja de ser plana en cuanto el precio cambia', () => {
    expect(esSeriePlana([punto(0), punto(10, { precioMin: 44 }), punto(20)])).toBe(false);
  });

  it('sin datos de precio no es plana', () => {
    expect(esSeriePlana([])).toBe(false);
    expect(esSeriePlana([punto(0, { precioMin: null })])).toBe(false);
  });
});

describe('textoSerieCompacta', () => {
  it('resume una serie plana en una línea', () => {
    const puntos = Array.from({ length: 12 }, (_, i) => punto(i, { precioMin: 38 }));
    const serie = agruparPrecios(puntos)[0];
    expect(textoSerieCompacta(serie!)).toBe(
      `08:00 · tren 03311 — ${formatearPrecio(38)} (sin cambios · 12 sondeos)`,
    );
  });

  it('sin número de tren solo deja la hora', () => {
    const serie = agruparPrecios([punto(0, { numeroTren: '' })])[0];
    expect(textoSerieCompacta(serie!)).not.toContain('tren');
    expect(textoSerieCompacta(serie!)).toContain('08:00');
  });

  it('singular cuando solo hay un sondeo', () => {
    const serie = agruparPrecios([punto(0)])[0];
    expect(textoSerieCompacta(serie!)).toContain('sin cambios · 1 sondeo)');
  });
});

describe('recortarContagos', () => {
  it('pinta solo los últimos 8 grupos', () => {
    const { visibles, sondeosOcultos } = recortarContagos(contagosEnTramos(10, 1));
    expect(visibles).toHaveLength(MAX_GRUPOS_GRAFICA);
    expect(sondeosOcultos).toBe(2);
    expect(visibles.map((grupo) => grupo.precioMin)).toEqual([32, 33, 34, 35, 36, 37, 38, 39]);
  });

  it('suma los sondeos de los grupos ocultos', () => {
    const { visibles, sondeosOcultos } = recortarContagos(contagosEnTramos(10, 3));
    expect(visibles).toHaveLength(8);
    expect(visibles.every((grupo) => grupo.cantidad === 3)).toBe(true);
    expect(sondeosOcultos).toBe(6);
  });

  it('no recorta con 8 grupos o menos', () => {
    expect(recortarContagos(contagosEnTramos(3, 2))).toEqual({
      visibles: expect.anything(),
      sondeosOcultos: 0,
    });
    expect(recortarContagos([])).toEqual({ visibles: [], sondeosOcultos: 0 });
  });
});

describe('textoSondeosOcultos', () => {
  it('indica cuántos sondeos anteriores quedan fuera', () => {
    expect(textoSondeosOcultos(0)).toBe('');
    expect(textoSondeosOcultos(1)).toBe('…y 1 sondeo anterior');
    expect(textoSondeosOcultos(37)).toBe('…y 37 sondeos anteriores');
  });
});

describe('anchoBarra', () => {
  it('es proporcional al rango min→max del tren', () => {
    expect(anchoBarra(45, 40, 50)).toBe(50);
    expect(anchoBarra(50, 40, 50)).toBe(100);
    expect(anchoBarra(40, 40, 50)).toBe(8);
  });

  it('pinta el 100% cuando todos los precios son iguales', () => {
    expect(anchoBarra(45, 45, 45)).toBe(100);
  });

  it('sin precio no dibuja barra', () => {
    expect(anchoBarra(null, 40, 50)).toBe(0);
    expect(anchoBarra(45, null, null)).toBe(0);
  });

  it('funciona con el precio de un grupo ya agrupado', () => {
    const contagos = agruparContagos([
      punto(0, { precioMin: 45 }),
      punto(10, { precioMin: 45 }),
      punto(20, { precioMin: 40 }),
      punto(30, { precioMin: 50 }),
    ]);
    expect(anchoBarra(contagos[0]?.precioMin ?? null, 40, 50)).toBe(50);
    expect(anchoBarra(contagos[1]?.precioMin ?? null, 40, 50)).toBe(8);
  });
});

describe('consejoPrecio', () => {
  it('avisa de que ha bajado desde un precio anterior', () => {
    const consejo = consejoPrecio([
      punto(0, { precioMin: 45 }),
      punto(10, { precioMin: 42 }),
      punto(20, { precioMin: 38 }),
    ]);
    expect(consejo).toBe(`El precio ha bajado desde ${formatearPrecio(45)} → buen momento`);
  });

  it('indica el mínimo histórico cuando el precio sube', () => {
    const consejo = consejoPrecio([
      punto(0, { precioMin: 35 }),
      punto(10, { precioMin: 40 }),
      punto(20, { precioMin: 44 }),
    ]);
    expect(consejo).toContain('Sube:');
    expect(consejo).toContain(formatearPrecio(35));
  });

  it('sin movimiento indica que el precio sigue estable', () => {
    expect(consejoPrecio([punto(0), punto(10), punto(20)])).toBe(
      'Precio estable en las últimas 1 h',
    );
  });

  it('cuenta las horas de la ventana observada', () => {
    const diaSiguiente = new Date(Date.UTC(2026, 8, 2, 8, 0)).toISOString();
    expect(consejoPrecio([punto(0), { ...punto(0), registradoEn: diaSiguiente }])).toBe(
      'Precio estable en las últimas 24 h',
    );
  });

  it('sin precios registrados lo dice', () => {
    expect(consejoPrecio([])).toBe('Sin datos de precio todavía');
    expect(consejoPrecio([punto(0, { precioMin: null })])).toBe('Sin datos de precio todavía');
  });
});

describe('formatearPrecio', () => {
  it('formatea en euros o muestra una raya', () => {
    expect(formatearPrecio(null)).toBe('—');
    expect(formatearPrecio(45)).toContain('45');
  });
});
