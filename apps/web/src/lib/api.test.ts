import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorApi, api } from './api';
import { i18n } from '@/i18n';
import { tokenEnMemoria } from './supabase';

const fetchMock = vi.fn();

/** Respuesta mínima con la forma que `api` consume (`status`/`ok`/`text`). */
function respuesta(status: number, cuerpo?: unknown): Response {
  const texto = cuerpo === undefined ? '' : JSON.stringify(cuerpo);
  return {
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(texto),
  } as Response;
}

/** Await que distingue «se resolvió» (null) de «se rechazó» (el error). */
async function rechazo(promesa: Promise<unknown>): Promise<unknown> {
  return promesa.then(
    () => null,
    (error: unknown) => error,
  );
}

/** Cada test usa su propia ruta: la caché vive a nivel de módulo. */
let contadorRutas = 0;
function rutaDePrueba(): string {
  contadorRutas += 1;
  return `/estaciones?caso=${contadorRutas}`;
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  // El detalle crudo de los fallos solo va a consola: no queremos ruido aquí
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  // Con token en memoria ninguna llamada consulta /api/auth/session
  tokenEnMemoria.fijar('tok-viejo');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  tokenEnMemoria.limpiar();
});

describe('cliente api: dedupe y caché de GET', () => {
  it('dos GET concurrentes con la misma ruta y token comparten un solo fetch', async () => {
    const ruta = rutaDePrueba();
    let liberar!: (r: Response) => void;
    fetchMock.mockReturnValue(new Promise<Response>((resolver) => (liberar = resolver)));

    const primero = api<{ n: number }>(ruta);
    const segundo = api<{ n: number }>(ruta);
    await new Promise((resolver) => setTimeout(resolver, 0));

    expect(fetchMock).toHaveBeenCalledTimes(1);

    liberar(respuesta(200, { n: 7 }));
    await expect(primero).resolves.toEqual({ n: 7 });
    await expect(segundo).resolves.toEqual({ n: 7 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('dentro de los 5 s responde de la caché y después vuelve a pedir', async () => {
    const ruta = rutaDePrueba();
    fetchMock.mockResolvedValue(respuesta(200, { n: 1 }));

    await expect(api<{ n: number }>(ruta)).resolves.toEqual({ n: 1 });
    await expect(api<{ n: number }>(ruta)).resolves.toEqual({ n: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 5_001);

    await expect(api<{ n: number }>(ruta)).resolves.toEqual({ n: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('la clave de caché lleva el Authorization: un refresh no sirve respuestas viejas', async () => {
    const ruta = rutaDePrueba();
    fetchMock.mockResolvedValue(respuesta(200, { n: 1 }));

    await api(ruta);
    tokenEnMemoria.fijar('tok-nuevo');
    await api(ruta);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const cabecerasDe = (i: number): Headers =>
      new Headers((fetchMock.mock.calls[i]?.[1] as RequestInit | undefined)?.headers);
    expect(cabecerasDe(0).get('Authorization')).toBe('Bearer tok-viejo');
    expect(cabecerasDe(1).get('Authorization')).toBe('Bearer tok-nuevo');
  });

  it('los errores no se cachean: cada intento nuevo vuelve a fetchar', async () => {
    const ruta = rutaDePrueba();
    fetchMock.mockRejectedValue(new TypeError('fallo de red'));

    expect(await rechazo(api(ruta))).toBeInstanceOf(TypeError);
    expect(await rechazo(api(ruta))).toBeInstanceOf(TypeError);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('cliente api: invalidación por mutaciones', () => {
  it('una mutación con éxito vacía toda la caché de GET', async () => {
    const ruta = rutaDePrueba();
    fetchMock.mockResolvedValue(respuesta(200, { n: 1 }));
    await api(ruta);
    await api(ruta);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fetchMock.mockResolvedValue(respuesta(200, { ok: true }));
    await api('/alertas/1', { method: 'PATCH', json: { estado: 'pausada' } });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    fetchMock.mockResolvedValue(respuesta(200, { n: 2 }));
    await expect(api<{ n: number }>(ruta)).resolves.toEqual({ n: 2 });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('una mutación fallida no toca la caché', async () => {
    const ruta = rutaDePrueba();
    fetchMock.mockResolvedValue(respuesta(200, { n: 1 }));
    await api(ruta);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fetchMock.mockResolvedValue(respuesta(500, { error: 'boom' }));
    await expect(api('/alertas/2', { method: 'DELETE' })).rejects.toBeInstanceOf(ErrorApi);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    fetchMock.mockResolvedValue(respuesta(200, { n: 9 }));
    await expect(api<{ n: number }>(ruta)).resolves.toEqual({ n: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('cliente api: cancelaciones', () => {
  it('un GET con señal ni lee ni escribe la caché', async () => {
    const ruta = rutaDePrueba();
    fetchMock.mockResolvedValue(respuesta(200, { n: 1 }));
    const controlador = new AbortController();

    await api(ruta, { signal: controlador.signal });
    await api(ruta, { signal: controlador.signal });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    await api(ruta);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    await api(ruta);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('abortar una llamada con señal no mata la petición compartida', async () => {
    const ruta = rutaDePrueba();
    fetchMock.mockImplementation(
      (_entrada: unknown, init?: RequestInit) =>
        new Promise<Response>((resolver, rechazar) => {
          const senal = init?.signal;
          if (!senal) {
            resolver(respuesta(200, { ok: true }));
            return;
          }
          if (senal.aborted) {
            rechazar(senal.reason);
            return;
          }
          senal.addEventListener('abort', () => rechazar(senal.reason), { once: true });
          setTimeout(() => resolver(respuesta(200, { ok: true })), 5);
        }),
    );

    const controlador = new AbortController();
    const compartida = api<{ ok: boolean }>(ruta);
    const canceladaPromesa = api<{ ok: boolean }>(ruta, { signal: controlador.signal });
    controlador.abort();

    const cancelada = await rechazo(canceladaPromesa);
    expect(cancelada).not.toBeNull();
    expect((cancelada as { name: string }).name).toBe('AbortError');
    await expect(compartida).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('cliente api: errores por status', () => {
  it('mapea el status a mensaje i18n y no cachea el fallo', async () => {
    const ruta = rutaDePrueba();
    fetchMock.mockResolvedValue(respuesta(404, { error: 'x'.repeat(300) }));

    const error = await rechazo(api(ruta));
    expect(error).toBeInstanceOf(ErrorApi);
    expect((error as ErrorApi).status).toBe(404);
    expect((error as ErrorApi).message).toBe(i18n.t('errores.status404'));

    expect(await rechazo(api(ruta))).toBeInstanceOf(ErrorApi);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('devuelve undefined en 204 y limpia la caché al mutar', async () => {
    const ruta = rutaDePrueba();
    fetchMock.mockResolvedValue(respuesta(204));
    await expect(api(ruta)).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await expect(api('/alertas/3', { method: 'DELETE' })).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(2);

    fetchMock.mockResolvedValue(respuesta(200, { n: 1 }));
    await expect(api<{ n: number }>(ruta)).resolves.toEqual({ n: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
