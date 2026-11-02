import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TrenesService } from './trenes.service';

const { paradaFindManyMock } = vi.hoisted(() => ({ paradaFindManyMock: vi.fn() }));

vi.mock('@mantirenfe/database', () => ({
  getPrisma: () => ({ paradaHorario: { findMany: paradaFindManyMock } }),
  buscarEstaciones: vi.fn(),
}));

/**
 * `GET /trenes/ruta`: la ruta que recorre un tren, para poder dibujarla en el
 * mapa (la traza registrada es escasa y las posiciones en vivo solo cubren lo
 * visto mientras el mapa estaba abierto).
 */
describe('TrenesService.rutaTrip', () => {
  beforeEach(() => paradaFindManyMock.mockReset());

  it('devuelve las paradas ordenadas con sus coordenadas', async () => {
    paradaFindManyMock.mockResolvedValue([
      {
        llegadaMin: 10,
        salidaMin: null,
        estacion: { nombre: 'Vigo-Guixar', latitud: 42.23, longitud: -8.71 },
      },
      {
        llegadaMin: 60,
        salidaMin: 61,
        estacion: { nombre: 'Madrid-Atocha', latitud: 40.4, longitud: -3.69 },
      },
    ]);

    const ruta = await new TrenesService().rutaTrip('trip-1');

    expect(ruta.tripId).toBe('trip-1');
    expect(ruta.puntos.map((p) => p.nombre)).toEqual(['Vigo-Guixar', 'Madrid-Atocha']);
    expect(ruta.puntos[1]).toEqual({
      nombre: 'Madrid-Atocha',
      latitud: 40.4,
      longitud: -3.69,
      llegadaMin: 60,
      salidaMin: 61,
    });
    // La PK [tripId, orden] es la que sirve esta consulta
    expect(paradaFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tripId: 'trip-1' },
        orderBy: { orden: 'asc' },
      }),
    );
  });

  it('omite las estaciones sin coordenadas (la línea no se podría dibujar)', async () => {
    paradaFindManyMock.mockResolvedValue([
      {
        llegadaMin: null,
        salidaMin: null,
        estacion: { nombre: 'X', latitud: null, longitud: null },
      },
      {
        llegadaMin: 5,
        salidaMin: 6,
        estacion: { nombre: 'Y', latitud: 40.1, longitud: -3.2 },
      },
    ]);

    const ruta = await new TrenesService().rutaTrip('trip-2');

    expect(ruta.puntos).toHaveLength(1);
    expect(ruta.puntos[0]?.nombre).toBe('Y');
  });
});
