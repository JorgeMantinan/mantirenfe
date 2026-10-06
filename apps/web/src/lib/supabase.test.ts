import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  canjearCodigoConCookie,
  cerrarSesionCookie,
  claveStorageSupabase,
  consultarSesionCookie,
  decodificarJwt,
  leerCodeVerifierPkce,
  loginConCookie,
  sesionDeCookie,
  tokenEnMemoria,
  usuarioDeCookie,
} from './supabase';

function jwt(payload: Record<string, unknown>): string {
  const base64 = (dato: unknown) => Buffer.from(JSON.stringify(dato)).toString('base64url');
  return `${base64({ alg: 'ES256', typ: 'JWT' })}.${base64(payload)}.firma`;
}

function respuesta(datos: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => datos,
    text: async () => JSON.stringify(datos),
  } as unknown as Response;
}

const fetchMock = vi.fn();

beforeEach(() => {
  tokenEnMemoria.limpiar();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('tokenEnMemoria', () => {
  it('guarda el token en memoria (nunca en storage) y lo expone vigente', () => {
    const token = jwt({ exp: Math.floor(Date.now() / 1000) + 3600 });
    tokenEnMemoria.fijar(token);
    expect(tokenEnMemoria.vigente()).toBe(token);
  });

  it('devuelve null si no hay token o ya caducó', () => {
    expect(tokenEnMemoria.vigente()).toBeNull();
    tokenEnMemoria.fijar(jwt({ exp: Math.floor(Date.now() / 1000) - 10 }));
    expect(tokenEnMemoria.vigente()).toBeNull();
  });

  it('tiene en cuenta el margen para no mandar un Bearer a punto de expirar', () => {
    tokenEnMemoria.fijar(jwt({ exp: Math.floor(Date.now() / 1000) + 30 }));
    expect(tokenEnMemoria.vigente(60_000)).toBeNull();
    expect(tokenEnMemoria.vigente(0)).not.toBeNull();
  });

  it('limpiar lo vacía (logout)', () => {
    tokenEnMemoria.fijar(jwt({ exp: Math.floor(Date.now() / 1000) + 3600 }));
    tokenEnMemoria.limpiar();
    expect(tokenEnMemoria.vigente()).toBeNull();
  });
});

describe('decodificarJwt', () => {
  it('lee el payload sin verificar la firma', () => {
    const datos = decodificarJwt(jwt({ sub: 'u1', email: 'a@b.c' }));
    expect(datos).toMatchObject({ sub: 'u1', email: 'a@b.c' });
  });

  it('soporta acentos y ñ (UTF-8 del payload)', () => {
    const datos = decodificarJwt(jwt({ nombre: 'José Muñoz' }));
    expect(datos?.nombre).toBe('José Muñoz');
  });

  it('token no JWT o payload que no es objeto → null', () => {
    expect(decodificarJwt('noesunjtw')).toBeNull();
    expect(decodificarJwt('solo.uno')).toBeNull();
    expect(decodificarJwt('a.eyJ4IjoxfQ.')).not.toBeNull();
    expect(decodificarJwt('a.IjEyMyI.')).toBeNull();
  });
});

describe('usuarioDeCookie / sesionDeCookie', () => {
  it('mapea los claims a los tipos de supabase-js que usa la app', () => {
    const usuario = usuarioDeCookie({
      sub: 'u-9',
      email: 'ana@example.com',
      nombre: 'Ana',
      avatarUrl: 'https://x/a.png',
      proveedor: 'google',
    });
    expect(usuario.id).toBe('u-9');
    expect(usuario.email).toBe('ana@example.com');
    expect(usuario.app_metadata).toEqual({ provider: 'google' });
    expect(usuario.user_metadata).toEqual({
      full_name: 'Ana',
      avatar_url: 'https://x/a.png',
    });
  });

  it('la sesión de cookie no expone refresh token (vive en la cookie httpOnly)', () => {
    const sesion = sesionDeCookie({
      access_token: 'at',
      expires_at: 2_000_000_000,
      user: {
        sub: 'u-9',
        email: 'ana@example.com',
        nombre: null,
        avatarUrl: null,
        proveedor: 'email',
      },
    });
    expect(sesion.access_token).toBe('at');
    expect(sesion.refresh_token).toBe('');
    expect(sesion.expires_at).toBe(2_000_000_000);
    expect(sesion.user.id).toBe('u-9');
  });
});

describe('consultarSesionCookie', () => {
  const SESION = {
    access_token: jwt({ exp: Math.floor(Date.now() / 1000) + 3600, sub: 'u1' }),
    expires_at: 2_000_000_000,
    user: {
      sub: 'u1',
      email: 'a@b.c',
      nombre: null,
      avatarUrl: null,
      proveedor: 'email',
    },
  };

  it('con sesión devuelve los datos y fija el token en memoria', async () => {
    fetchMock.mockResolvedValueOnce(respuesta({ session: SESION }));

    const sesion = await consultarSesionCookie();

    expect(sesion?.user.sub).toBe('u1');
    expect(tokenEnMemoria.vigente()).toBe(SESION.access_token);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/session',
      expect.objectContaining({ credentials: 'same-origin' }),
    );
  });

  it('sin sesión devuelve null y recuerda el fallo (no repite la llamada)', async () => {
    fetchMock.mockResolvedValueOnce(respuesta({ session: null }));

    expect(await consultarSesionCookie()).toBeNull();
    expect(await consultarSesionCookie()).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(tokenEnMemoria.vigente()).toBeNull();
  });

  it('respuesta de error o red caída → null sin lanzar', async () => {
    fetchMock.mockResolvedValueOnce(respuesta({ error: 'boom' }, 500));
    expect(await consultarSesionCookie()).toBeNull();

    tokenEnMemoria.limpiar();
    fetchMock.mockRejectedValueOnce(new Error('offline'));
    expect(await consultarSesionCookie()).toBeNull();
  });

  it('las llamadas concurrentes comparten una sola petición', async () => {
    fetchMock.mockResolvedValue(respuesta({ session: SESION }));

    const [a, b] = await Promise.all([consultarSesionCookie(), consultarSesionCookie()]);

    expect(a?.access_token).toBe(SESION.access_token);
    expect(b?.access_token).toBe(SESION.access_token);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('un login por cookie invalida el «sin sesión» memorizado', async () => {
    fetchMock.mockResolvedValueOnce(respuesta({ session: null }));
    expect(await consultarSesionCookie()).toBeNull();

    fetchMock.mockResolvedValueOnce(respuesta({ ok: true }));
    await expect(loginConCookie('ana@example.com', 'secreta')).resolves.toEqual({ ok: true });

    fetchMock.mockResolvedValueOnce(respuesta({ session: SESION }));
    expect(await consultarSesionCookie()).not.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});

describe('loginConCookie', () => {
  it('POST a /api/auth/login con el body correcto', async () => {
    fetchMock.mockResolvedValueOnce(respuesta({ ok: true }));

    await expect(loginConCookie('ana@example.com', 'secreta')).resolves.toEqual({ ok: true });

    const [ruta, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(ruta).toBe('/api/auth/login');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({
      email: 'ana@example.com',
      password: 'secreta',
    });
  });

  it('4xx con mensaje del filtro global → ok: false con ese mensaje', async () => {
    fetchMock.mockResolvedValueOnce(
      respuesta({ error: 'Invalid login credentials', message: 'Invalid login credentials' }, 400),
    );
    await expect(loginConCookie('a@b.c', 'mala')).resolves.toEqual({
      ok: false,
      mensaje: 'Invalid login credentials',
    });
  });

  it('sin red o timeout → ok: false sin mensaje (para probar el fallback)', async () => {
    fetchMock.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    await expect(loginConCookie('a@b.c', 'x')).resolves.toEqual({ ok: false });
  });

  it('cuerpo que no es JSON no se propaga como mensaje', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 502,
      json: async () => null,
      text: async () => '<html>error</html>',
    } as unknown as Response);
    await expect(loginConCookie('a@b.c', 'x')).resolves.toEqual({ ok: false, mensaje: undefined });
  });
});

describe('canjearCodigoConCookie', () => {
  it('POST a /api/auth/callback con code y code_verifier', async () => {
    fetchMock.mockResolvedValueOnce(respuesta({ ok: true }));

    await expect(canjearCodigoConCookie('codigo-1', 'verifier-1')).resolves.toEqual({ ok: true });

    const [ruta, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(ruta).toBe('/api/auth/callback');
    expect(JSON.parse(init.body as string)).toEqual({
      code: 'codigo-1',
      code_verifier: 'verifier-1',
    });
  });
});

describe('cerrarSesionCookie', () => {
  it('POST a /api/auth/logout y no lanza si la API no responde', async () => {
    fetchMock.mockResolvedValueOnce(respuesta({ ok: true }));
    await expect(cerrarSesionCookie()).resolves.toBeUndefined();
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/auth/logout');

    fetchMock.mockRejectedValueOnce(new Error('offline'));
    await expect(cerrarSesionCookie()).resolves.toBeUndefined();
  });
});

describe('claveStorageSupabase', () => {
  it('replica la clave por defecto de supabase-js (sb-<ref>-auth-token)', () => {
    expect(claveStorageSupabase('https://abcdefgh.supabase.co')).toBe('sb-abcdefgh-auth-token');
    expect(claveStorageSupabase('https://abcdefgh.supabase.co/auth/v1')).toBe(
      'sb-abcdefgh-auth-token',
    );
  });

  it('con URL inválida o vacía usa la clave fija de auth-js', () => {
    expect(claveStorageSupabase('no-es-url')).toBe('supabase.auth.token');
    expect(claveStorageSupabase('')).toBe('supabase.auth.token');
  });
});

describe('leerCodeVerifierPkce', () => {
  const CLAVE = claveStorageSupabase('https://abcdefgh.supabase.co');

  function almacen(valores: Record<string, string>): Pick<Storage, 'getItem'> {
    return { getItem: (clave: string) => valores[clave] ?? null };
  }

  it('lee la clave fija que escribe supabase-js', () => {
    const almacenado = almacen({ [`${CLAVE}-code-verifier`]: 'verifier-abc' });
    expect(leerCodeVerifierPkce('', almacenado, CLAVE)).toBe('verifier-abc');
  });

  it('si la URL trae sb_flow_id prioriza el slot de ese flujo', () => {
    const almacenado = almacen({
      [`${CLAVE}-code-verifier`]: 'verifier-viejo',
      [`${CLAVE}-flow-xyz123-code-verifier`]: 'verifier-nuevo',
    });
    expect(leerCodeVerifierPkce('?code=1&sb_flow_id=xyz123', almacenado, CLAVE)).toBe(
      'verifier-nuevo',
    );
  });

  it('si el slot del flujo no existe cae en la clave fija', () => {
    const almacenado = almacen({ [`${CLAVE}-code-verifier`]: 'verifier-abc' });
    expect(leerCodeVerifierPkce('?sb_flow_id=xyz123', almacenado, CLAVE)).toBe('verifier-abc');
  });

  it('quita el sufijo «/recovery» que añade auth-js', () => {
    const almacenado = almacen({ [`${CLAVE}-code-verifier`]: 'verifier-abc/recovery' });
    expect(leerCodeVerifierPkce('', almacenado, CLAVE)).toBe('verifier-abc');
  });

  it('sin verifier en el storage → null (el fallback de supabase-js se encarga)', () => {
    expect(leerCodeVerifierPkce('', almacen({}), CLAVE)).toBeNull();
    expect(leerCodeVerifierPkce('', null, CLAVE)).toBeNull();
  });
});
