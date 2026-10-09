import { BadGatewayException, BadRequestException, Logger } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Contrato de `GET /trenes/disponibilidad`: plazas y precio de una ruta+fecha
 * desde la venta DWR, con el DTO público de `EstadoTrenDisponible` (sin campos
 * internos como `trenId`, `moneda` o `tramo`). Si la venta falla → 502.
 */
const { buscarEstacionesMock, getDisponibilidadMock } = vi.hoisted(() => ({
  buscarEstacionesMock: vi.fn(),
  getDisponibilidadMock: vi.fn(),
}));

vi.mock('@mantirenfe/database', () => ({
  getPrisma: () => ({}),
  buscarEstaciones: buscarEstacionesMock,
}));

vi.mock('@mantirenfe/venta', () => ({
  FuenteRenfeDwr: class {
    getDisponibilidad = getDisponibilidadMock;
  },
}));

const { TrenesService } = await import('./trenes.service');

const ORIGEN = { id: 'e1', codigo: '31412', nombre: 'A CORUÑA' };
const DESTINO = { id: 'e2', codigo: '08223', nombre: 'VIGO URZAIZ' };
const FECHA = '2026-10-12';

function estacionNoEncontrada(): never[] {
  return [];
}

beforeEach(() => {
  buscarEstacionesMock.mockReset();
  getDisponibilidadMock.mockReset();
  buscarEstacionesMock.mockResolvedValue([ORIGEN]);
});

function consultar(): Promise<unknown> {
  return new TrenesService().disponibilidad({
    origen: 'A Coruña',
    destino: 'Vigo',
    fecha: FECHA,
  });
}

describe('TrenesService.disponibilidad', () => {
  it('resuelve las estaciones y expone el DTO público (sin campos internos)', async () => {
    buscarEstacionesMock.mockImplementation(async (_prisma: unknown, texto: string) =>
      texto === 'A Coruña' ? [ORIGEN] : [DESTINO],
    );
    getDisponibilidadMock.mockResolvedValue({
      consulta: { origenNombre: ORIGEN.nombre, destinoNombre: DESTINO.nombre, fecha: FECHA },
      consultadoEn: '2026-10-12T10:00:00.000Z',
      trenes: [
        {
          trenId: '04404-2026-10-12',
          numeroTren: '04404',
          salida: '19:33',
          horaLlegada: '23:07',
          tipoTren: 'AVE',
          tarifa: 'Básico',
          disponible: true,
          precioMin: 40.7,
          moneda: 'EUR',
          tramo: 'directo',
        },
        {
          trenId: '09201 + 00622-2026-10-12',
          numeroTren: '09201 + 00622',
          salida: '21:00',
          disponible: false,
          precioMin: null,
          moneda: 'EUR',
          tramo: 'conexion',
        },
      ],
    });

    const respuesta = await consultar();

    expect(getDisponibilidadMock).toHaveBeenCalledWith({
      origenNombre: 'A CORUÑA',
      destinoNombre: 'VIGO URZAIZ',
      fecha: FECHA,
    });
    expect(respuesta).toEqual([
      {
        numeroTren: '04404',
        salida: '19:33',
        llegada: '23:07',
        tipoTren: 'AVE',
        tarifa: 'Básico',
        disponible: true,
        precioMin: 40.7,
        cancelado: false,
      },
      {
        numeroTren: '09201 + 00622',
        salida: '21:00',
        llegada: null,
        tipoTren: null,
        tarifa: null,
        disponible: false,
        precioMin: null,
        cancelado: false,
      },
    ]);
  });

  it('ordena por hora de salida aunque la venta devuelva otro orden', async () => {
    buscarEstacionesMock.mockImplementation(async (_prisma: unknown, texto: string) =>
      texto === 'A Coruña' ? [ORIGEN] : [DESTINO],
    );
    getDisponibilidadMock.mockResolvedValue({
      consulta: {},
      consultadoEn: '',
      trenes: [
        { trenId: 'b', numeroTren: '22002', salida: '21:00', disponible: false, precioMin: null },
        { trenId: 'a', numeroTren: '22000', salida: '06:27', disponible: true, precioMin: 25.5 },
      ],
    });

    const respuesta = (await consultar()) as Array<{ numeroTren: string }>;
    expect(respuesta.map((t) => t.numeroTren)).toEqual(['22000', '22002']);
  });

  it('sin estaciones resueltas devuelve vacío sin consultar a la venta', async () => {
    buscarEstacionesMock.mockResolvedValue(estacionNoEncontrada());

    await expect(consultar()).resolves.toEqual([]);
    expect(getDisponibilidadMock).not.toHaveBeenCalled();
  });

  it('query inválida (fecha malformada o nombres cortos) → 400', async () => {
    await expect(
      new TrenesService().disponibilidad({ origen: 'A', destino: 'Vigo', fecha: FECHA }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      new TrenesService().disponibilidad({
        origen: 'A Coruña',
        destino: 'Vigo',
        fecha: '12-10-2026',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(getDisponibilidadMock).not.toHaveBeenCalled();
  });

  it('si la venta falla responde 502 (el detalle solo va al log)', async () => {
    buscarEstacionesMock.mockImplementation(async (_prisma: unknown, texto: string) =>
      texto === 'A Coruña' ? [ORIGEN] : [DESTINO],
    );
    getDisponibilidadMock.mockRejectedValue(new Error('HTTP 429 en /vol/buscarTren.do'));
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

    const error = await consultar().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(BadGatewayException);
    expect((error as Error).message).not.toContain('429');
    expect((error as Error).message).not.toContain('venta.renfe.com');
  });
});
