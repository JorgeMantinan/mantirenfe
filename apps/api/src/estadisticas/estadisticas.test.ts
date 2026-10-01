import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TIPO_AVISO_SIN_TIPO } from '@mantirenfe/shared-types';
import { EstadisticasService } from './estadisticas.service';

/**
 * Contrato de `GET /estadisticas`: dos queries agregadas (una sola para todos
 * los avisos de la ventana y un `groupBy` de estados), nunca una por fila.
 */
const { queryRawMock, groupByMock } = vi.hoisted(() => ({
  queryRawMock: vi.fn(),
  groupByMock: vi.fn(),
}));

vi.mock('@mantirenfe/database', () => ({
  getPrisma: () => ({
    $queryRaw: queryRawMock,
    alerta: { groupBy: groupByMock },
  }),
}));

const USUARIO = { sub: 'u1', email: 'u1@example.com' };

/** SQL completo de la primera (y única) consulta de avisos. */
function sqlAvisos(): string {
  const [plantilla] = queryRawMock.mock.calls[0] ?? [];
  return Array.from(plantilla as ArrayLike<string>).join(' ');
}

function fila(tipo: string | null, total: number) {
  return { tipo, total };
}

function estado(valor: 'ACTIVA' | 'PAUSA' | 'COMPLETADA', total: number) {
  return { estado: valor, _count: { _all: total } };
}

beforeEach(() => {
  queryRawMock.mockReset();
  groupByMock.mockReset();
  queryRawMock.mockResolvedValue([]);
  groupByMock.mockResolvedValue([]);
});

describe('EstadisticasService.obtener', () => {
  it('agrupa los avisos por datos->>tipo en SQL y mete los sin tipo en "alertas"', async () => {
    queryRawMock.mockResolvedValue([
      fila('cancelacion', 3),
      fila('precio', 1),
      fila(null, 12),
      fila('', 2),
    ]);
    groupByMock.mockResolvedValue([estado('ACTIVA', 2)]);

    const resultado = await new EstadisticasService().obtener(USUARIO);

    expect(resultado.avisos).toEqual({
      total: 18,
      porTipo: { cancelacion: 3, precio: 1, [TIPO_AVISO_SIN_TIPO]: 14 },
    });
    expect(resultado.periodoDias).toBe(30);
    expect(sqlAvisos()).toContain('GROUP BY');
    expect(sqlAvisos()).toContain('"Notificacion"');
  });

  it('acota la ventana a 30 días y al usuario actual (una consulta, sin N+1)', async () => {
    queryRawMock.mockResolvedValue([fila('incidencia', 4)]);
    groupByMock.mockResolvedValue([estado('ACTIVA', 1)]);

    await new EstadisticasService().obtener(USUARIO);

    const [, usuarioId, desde] = queryRawMock.mock.calls[0];
    expect(usuarioId).toBe('u1');
    expect(desde).toBeInstanceOf(Date);
    const dias = (Date.now() - desde.getTime()) / 86_400_000;
    expect(dias).toBeGreaterThan(29.9);
    expect(dias).toBeLessThan(30.1);

    expect(queryRawMock).toHaveBeenCalledTimes(1);
    expect(groupByMock).toHaveBeenCalledTimes(1);
    expect(groupByMock).toHaveBeenCalledWith(
      expect.objectContaining({
        by: ['estado'],
        where: { usuarioId: 'u1' },
      }),
    );
  });

  it('traduce los estados al recuento del DTO (los que no salen, a 0)', async () => {
    queryRawMock.mockResolvedValue([]);
    groupByMock.mockResolvedValue([
      estado('COMPLETADA', 1),
      estado('ACTIVA', 4),
      estado('PAUSA', 2),
    ]);

    const resultado = await new EstadisticasService().obtener(USUARIO);

    expect(resultado.alertas).toEqual({ total: 7, activas: 4, pausa: 2, completadas: 1 });
  });

  it('usuario sin actividad: totales a 0 y sin tipos', async () => {
    const resultado = await new EstadisticasService().obtener(USUARIO);

    expect(resultado).toEqual({
      periodoDias: 30,
      avisos: { total: 0, porTipo: {} },
      alertas: { total: 0, activas: 0, pausa: 0, completadas: 0 },
    });
  });

  it('ignora filas de conteo vacías o no numéricas', async () => {
    queryRawMock.mockResolvedValue([fila('precio', 0), { tipo: 'precio', total: 'x' as never }]);
    groupByMock.mockResolvedValue([]);

    const resultado = await new EstadisticasService().obtener(USUARIO);

    expect(resultado.avisos).toEqual({ total: 0, porTipo: {} });
  });
});
