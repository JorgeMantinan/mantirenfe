import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clavePlazasPrecio, obtenerPlazasPrecio } from './plazas-precio';
import { tokenEnMemoria } from '@/lib/supabase';

const fetchMock = vi.fn();

function respuesta(status: number, cuerpo: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(JSON.stringify(cuerpo)),
  } as Response;
}

/** La caché vive a nivel de módulo: cada test usa una ruta distinta. */
let contador = 0;
function rutaDePrueba(): { origen: string; destino: string; fecha: string } {
  contador += 1;
  return { origen: `Origen ${contador}`, destino: `Destino ${contador}`, fecha: '2026-10-12' };
}

const FILA = {
  numeroTren: '04404',
  salida: '19:33',
  llegada: '23:07',
  tipoTren: 'AVE',
  tarifa: 'Básico',
  disponible: true,
  precioMin: 40.7,
  cancelado: false,
};

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  tokenEnMemoria.fijar('tok-test');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  tokenEnMemoria.limpiar();
});

describe('clavePlazasPrecio', () => {
  it('compone la clave con origen, destino y fecha', () => {
    expect(clavePlazasPrecio('A Coruña', 'Vigo', '2026-10-12')).toBe('A Coruña|Vigo|2026-10-12');
  });
});

describe('obtenerPlazasPrecio', () => {
  it('cachea por clave: la segunda llamada no vuelve a fetchar', async () => {
    const { origen, destino, fecha } = rutaDePrueba();
    fetchMock.mockResolvedValue(respuesta(200, [FILA]));

    const primera = await obtenerPlazasPrecio(origen, destino, fecha);
    const segunda = await obtenerPlazasPrecio(origen, destino, fecha);

    expect(primera).toEqual([FILA]);
    expect(segunda).toEqual([FILA]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = fetchMock.mock.calls[0]?.[0] as string;
    expect(url).toContain('/api/trenes/disponibilidad?');
    expect(url).toContain(`origen=${encodeURIComponent(origen)}`);
    expect(url).toContain(`destino=${encodeURIComponent(destino)}`);
    expect(url).toContain('fecha=2026-10-12');
  });

  it('distinta clave (otro destino) → otro fetch', async () => {
    const base = rutaDePrueba();
    fetchMock.mockResolvedValue(respuesta(200, [FILA]));

    await obtenerPlazasPrecio(base.origen, base.destino, base.fecha);
    await obtenerPlazasPrecio(base.origen, `${base.destino} 2`, base.fecha);

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('single-flight: dos llamadas concurrentes comparten un solo fetch', async () => {
    const { origen, destino, fecha } = rutaDePrueba();
    let liberar!: (r: Response) => void;
    fetchMock.mockReturnValue(new Promise<Response>((resolver) => (liberar = resolver)));

    const primera = obtenerPlazasPrecio(origen, destino, fecha);
    const segunda = obtenerPlazasPrecio(origen, destino, fecha);
    await Promise.resolve();
    liberar(respuesta(200, [FILA]));

    expect((await primera).length).toBe(1);
    expect((await segunda).length).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('no cachea errores: el siguiente intento vuelve a consultar', async () => {
    const { origen, destino, fecha } = rutaDePrueba();
    fetchMock.mockResolvedValueOnce(respuesta(502, { error: 'boom' }));
    fetchMock.mockResolvedValueOnce(respuesta(200, [FILA]));

    await expect(obtenerPlazasPrecio(origen, destino, fecha)).rejects.toThrow();
    await expect(obtenerPlazasPrecio(origen, destino, fecha)).resolves.toEqual([FILA]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
