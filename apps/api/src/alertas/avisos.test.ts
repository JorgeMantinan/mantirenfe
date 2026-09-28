import { describe, expect, it } from 'vitest';
import { formatearAvisos, juntarConteoAvisos, type ConteoAvisos, type FilaAviso } from './avisos';

describe('juntarConteoAvisos (agregado del listado)', () => {
  const alertas = [{ id: 'a1' }, { id: 'a2' }, { id: 'a3' }];

  it('asigna el total de cada alerta y 0 a las que no han dado avisos', () => {
    const conteos: ConteoAvisos[] = [
      { alertaId: 'a2', total: 7 },
      { alertaId: 'a1', total: 2 },
    ];
    expect(juntarConteoAvisos(alertas, conteos)).toEqual([
      { id: 'a1', avisosRecibidos: 2 },
      { id: 'a2', avisosRecibidos: 7 },
      { id: 'a3', avisosRecibidos: 0 },
    ]);
  });

  it('ignora los conteos de alertas que no están en el listado', () => {
    const conteos: ConteoAvisos[] = [
      { alertaId: 'ajena', total: 99 },
      { alertaId: null, total: 5 },
      { alertaId: 'a1', total: 1 },
    ];
    const resultado = juntarConteoAvisos(alertas, conteos);
    expect(resultado.map((a) => a.avisosRecibidos)).toEqual([1, 0, 0]);
    expect(resultado.map((a) => a.id)).toEqual(['a1', 'a2', 'a3']);
  });

  it('con un listado vacío no hay nada que agregar', () => {
    expect(juntarConteoAvisos([], [{ alertaId: 'a1', total: 3 }])).toEqual([]);
  });

  it('conserva el resto de campos de la alerta', () => {
    const [resultado] = juntarConteoAvisos(
      [{ id: 'a1', estado: 'ACTIVA' }],
      [{ alertaId: 'a1', total: 4 }],
    );
    expect(resultado).toEqual({ id: 'a1', estado: 'ACTIVA', avisosRecibidos: 4 });
  });
});

describe('formatearAvisos (histórico de una alerta)', () => {
  const fila = (minutos: number, extra: Partial<FilaAviso> = {}): FilaAviso => ({
    id: `n${minutos}`,
    titulo: 'Hay plazas',
    cuerpo: ' Madrid → Valencia a las 08:00',
    datos: { tipo: 'aviso', url: '/alertas/a1' },
    leida: false,
    creadaEn: new Date(Date.UTC(2026, 8, 1, 10, minutos)),
    ...extra,
  });

  it('normaliza la fecha a ISO y el Json a objeto', () => {
    expect(formatearAvisos([fila(30), fila(10)])).toEqual([
      {
        id: 'n30',
        titulo: 'Hay plazas',
        cuerpo: ' Madrid → Valencia a las 08:00',
        datos: { tipo: 'aviso', url: '/alertas/a1' },
        leida: false,
        creadaEn: '2026-09-01T10:30:00.000Z',
      },
      {
        id: 'n10',
        titulo: 'Hay plazas',
        cuerpo: ' Madrid → Valencia a las 08:00',
        datos: { tipo: 'aviso', url: '/alertas/a1' },
        leida: false,
        creadaEn: '2026-09-01T10:10:00.000Z',
      },
    ]);
  });

  it('devuelve datos a null cuando la notificación no lleva Json', () => {
    const [aviso] = formatearAvisos([fila(0, { datos: null, leida: true })]);
    expect(aviso?.datos).toBeNull();
    expect(aviso?.leida).toBe(true);
  });

  it('devuelve una lista vacía cuando la alerta aún no ha avisado', () => {
    expect(formatearAvisos([])).toEqual([]);
  });
});
