import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BadGatewayException, BadRequestException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { RefreshInvalidoError, SesionService, mensajeSupabase } from './sesion.service';

const URL = 'https://test.supabase.co';

function config(valores: Record<string, string | undefined> = {}): ConfigService {
  const mapa = {
    SUPABASE_URL: URL,
    VITE_SUPABASE_ANON_KEY: 'anon-key',
    ...valores,
  };
  return { get: (clave: string) => mapa[clave] } as unknown as ConfigService;
}

function b64url(dato: unknown): string {
  return Buffer.from(JSON.stringify(dato)).toString('base64url');
}

/** JWT de mentira solo para probar el decodificado (sin firma real). */
function jwt(payload: Record<string, unknown>): string {
  return `${b64url({ alg: 'ES256', typ: 'JWT' })}.${b64url(payload)}.firma`;
}

function payloadValido(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    sub: 'u-1',
    email: 'ana@example.com',
    exp: Math.floor(Date.now() / 1000) + 600,
    iss: `${URL}/auth/v1`,
    user_metadata: { full_name: 'Ana', avatar_url: 'https://x/a.png' },
    app_metadata: { provider: 'google' },
    ...extra,
  };
}

function respuesta(datos: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => (datos === null ? '' : JSON.stringify(datos)),
  } as unknown as Response;
}

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function crear(configurado?: ConfigService): SesionService {
  return new SesionService(configurado ?? config());
}

describe('SesionService.login', () => {
  it('llama al grant de password con la anon key y devuelve los tokens', async () => {
    fetchMock.mockResolvedValueOnce(
      respuesta({ access_token: jwt(payloadValido()), refresh_token: 'rt-1' }),
    );

    const tokens = await crear().login('ana@example.com', 'secreta');

    expect(tokens).toEqual({ access_token: expect.stringContaining('.'), refresh_token: 'rt-1' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${URL}/auth/v1/token?grant_type=password`);
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({ apikey: 'anon-key', Authorization: 'Bearer anon-key' });
    expect(JSON.parse(init.body as string)).toEqual({
      email: 'ana@example.com',
      password: 'secreta',
    });
  });

  it('credenciales inválidas → 400 con el mensaje saneado de Supabase', async () => {
    fetchMock.mockResolvedValue(respuesta({ code: 400, msg: 'Invalid login credentials' }, 400));
    await expect(crear().login('ana@example.com', 'mala')).rejects.toThrow(BadRequestException);
    await expect(crear().login('ana@example.com', 'mala')).rejects.toThrow(
      'Invalid login credentials',
    );
  });

  it('error de red → 502 (la web caerá en el flujo de supabase-js)', async () => {
    fetchMock.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    await expect(crear().login('a@b.c', 'x')).rejects.toThrow(BadGatewayException);
  });

  it('5xx de Supabase → 502 sin filtrar el cuerpo', async () => {
    fetchMock.mockResolvedValueOnce(respuesta({ error: 'boom interno' }, 500));
    await expect(crear().login('a@b.c', 'x')).rejects.toThrow(BadGatewayException);
  });

  it('sin URL o sin anon key → 502 de configuración', async () => {
    await expect(crear(config({ SUPABASE_URL: undefined })).login('a@b.c', 'x')).rejects.toThrow(
      'no está configurado',
    );
    await expect(
      crear(config({ VITE_SUPABASE_ANON_KEY: undefined })).login('a@b.c', 'x'),
    ).rejects.toThrow('no está configurado');
  });
});

describe('mensajeSupabase', () => {
  it('prefiere error_description/msg/message y lo sanea', () => {
    expect(mensajeSupabase({ error_description: 'Invalid login credentials' })).toBe(
      'Invalid login credentials',
    );
    expect(mensajeSupabase({ msg: 'Email not confirmed' })).toBe('Email not confirmed');
    expect(mensajeSupabase({ message: 'Cuenta <b>bloqueada</b>' })).toBe('Cuenta bloqueada');
    expect(mensajeSupabase({ msg: 'a\nb\tc' })).toBe('a b c');
    expect(mensajeSupabase({ msg: 'x'.repeat(400) })).toHaveLength(160);
  });

  it('si no hay mensaje legible devuelve null (o un texto plano)', () => {
    expect(mensajeSupabase({ code: 400 })).toBeNull();
    expect(mensajeSupabase(null)).toBeNull();
    expect(mensajeSupabase('texto plano')).toBe('texto plano');
    expect(mensajeSupabase({ error_code: 'invalid_credentials' })).toBe('invalid_credentials');
  });
});

describe('SesionService.canjearCodigo', () => {
  it('usa grant_type=pkce (el que envía auth-js) en el primer intento', async () => {
    fetchMock.mockResolvedValueOnce(
      respuesta({ access_token: jwt(payloadValido()), refresh_token: 'rt-2' }),
    );

    await crear().canjearCodigo('codigo-1', 'verifier-1');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`${URL}/auth/v1/token?grant_type=pkce`);
    expect(JSON.parse((fetchMock.mock.calls[0]?.[1] as RequestInit).body as string)).toEqual({
      auth_code: 'codigo-1',
      code_verifier: 'verifier-1',
    });
  });

  it('si el backend no conoce «pkce» reintenta con «pkce_code»', async () => {
    fetchMock
      .mockResolvedValueOnce(respuesta({ code: 400, msg: 'unsupported grant type' }, 400))
      .mockResolvedValueOnce(
        respuesta({ access_token: jwt(payloadValido()), refresh_token: 'rt-3' }),
      );

    const tokens = await crear().canjearCodigo('codigo-1', 'verifier-1');

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]?.[0]).toBe(`${URL}/auth/v1/token?grant_type=pkce_code`);
    expect(tokens.refresh_token).toBe('rt-3');
  });

  it('un código ya canjeado (400 sin «grant») no reintenta', async () => {
    fetchMock.mockResolvedValueOnce(respuesta({ code: 400, msg: 'flow state is invalid' }, 400));
    await expect(crear().canjearCodigo('codigo-1', 'verifier-1')).rejects.toThrow(
      BadRequestException,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('SesionService.refrescar', () => {
  it('renueva los tokens con el refresh', async () => {
    fetchMock.mockResolvedValueOnce(
      respuesta({ access_token: jwt(payloadValido()), refresh_token: 'rt-nuevo' }),
    );
    const tokens = await crear().refrescar('rt-viejo');
    expect(tokens).toEqual({ access_token: expect.any(String), refresh_token: 'rt-nuevo' });
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`${URL}/auth/v1/token?grant_type=refresh_token`);
  });

  it('refresh rechazado → RefreshInvalidoError (borrado de cookie)', async () => {
    fetchMock.mockResolvedValueOnce(respuesta({ msg: 'Invalid Refresh Token' }, 400));
    await expect(crear().refrescar('rt-viejo')).rejects.toThrow(RefreshInvalidoError);
  });

  it('sin token o con caracteres raros no se llama a Supabase', async () => {
    await expect(crear().refrescar('rt con espacios')).rejects.toThrow(RefreshInvalidoError);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('SesionService.sesionDesdeToken', () => {
  it('lee sub/exp y mapea el usuario sin verificar la firma', () => {
    const token = jwt(payloadValido());
    expect(crear().sesionDesdeToken(token)).toEqual({
      access_token: token,
      expires_at: expect.any(Number),
      user: {
        sub: 'u-1',
        email: 'ana@example.com',
        nombre: 'Ana',
        avatarUrl: 'https://x/a.png',
        proveedor: 'google',
      },
    });
  });

  it('token caducado o sin sub → null', () => {
    expect(crear().sesionDesdeToken(jwt(payloadValido({ exp: 1 })))).toBeNull();
    expect(crear().sesionDesdeToken(jwt({ exp: Math.floor(Date.now() / 1000) + 60 }))).toBeNull();
    expect(crear().sesionDesdeToken('no-es-un-jwt')).toBeNull();
  });

  it('iss de otro proyecto → null (no lo aceptaría el guard)', () => {
    const token = jwt(payloadValido({ iss: 'https://otro.supabase.co/auth/v1' }));
    expect(crear().sesionDesdeToken(token)).toBeNull();
  });

  it('rellena los huecos de metadata con valores por defecto', () => {
    const token = jwt({ sub: 'u-2', exp: Math.floor(Date.now() / 1000) + 60 });
    expect(crear().sesionDesdeToken(token)?.user).toEqual({
      sub: 'u-2',
      email: '',
      nombre: null,
      avatarUrl: null,
      proveedor: 'email',
    });
  });
});

describe('SesionService.sesionDeCookies', () => {
  it('con mv_at vigente no toca Supabase', async () => {
    const token = jwt(payloadValido());
    const resultado = await crear().sesionDeCookies({ mv_at: token, mv_rt: 'rt-1' });
    expect(resultado.sesion?.access_token).toBe(token);
    expect(resultado.renovado).toBeNull();
    expect(resultado.cookiesInvalidas).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('mv_at caducado con mv_rt vivo: renueva y devuelve los tokens nuevos', async () => {
    const caducado = jwt(payloadValido({ exp: Math.floor(Date.now() / 1000) - 10 }));
    fetchMock.mockResolvedValueOnce(
      respuesta({ access_token: jwt(payloadValido()), refresh_token: 'rt-rotado' }),
    );

    const resultado = await crear().sesionDeCookies({ mv_at: caducado, mv_rt: 'rt-viejo' });

    expect(resultado.sesion?.user.sub).toBe('u-1');
    expect(resultado.renovado?.refresh_token).toBe('rt-rotado');
    expect(resultado.cookiesInvalidas).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('renueva si al access le quedan menos de 60 s (margen de la web)', async () => {
    const porCaducar = jwt(payloadValido({ exp: Math.floor(Date.now() / 1000) + 30 }));
    fetchMock.mockResolvedValueOnce(
      respuesta({ access_token: jwt(payloadValido()), refresh_token: 'rt-n' }),
    );

    const resultado = await crear().sesionDeCookies({ mv_at: porCaducar, mv_rt: 'rt-viejo' });

    expect(resultado.renovado?.refresh_token).toBe('rt-n');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('sin mv_rt y con mv_at caducado: nada que rescatar y cookies a borrar', async () => {
    const caducado = jwt(payloadValido({ exp: Math.floor(Date.now() / 1000) - 10 }));
    const resultado = await crear().sesionDeCookies({ mv_at: caducado });
    expect(resultado).toEqual({ sesion: null, renovado: null, cookiesInvalidas: true });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refresh rechazado por Supabase → cookies inválidas', async () => {
    fetchMock.mockResolvedValueOnce(respuesta({ msg: 'Invalid Refresh Token' }, 401));
    const resultado = await crear().sesionDeCookies({ mv_rt: 'rt-malo' });
    expect(resultado).toEqual({ sesion: null, renovado: null, cookiesInvalidas: true });
  });

  it('caída de red: sin sesión pero SIN borrar cookies', async () => {
    fetchMock.mockRejectedValueOnce(new Error('offline'));
    const resultado = await crear().sesionDeCookies({ mv_rt: 'rt-1' });
    expect(resultado).toEqual({ sesion: null, renovado: null, cookiesInvalidas: false });
  });

  it('sin cookies → { session: null } sin llamadas', async () => {
    const resultado = await crear().sesionDeCookies({});
    expect(resultado).toEqual({ sesion: null, renovado: null, cookiesInvalidas: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
