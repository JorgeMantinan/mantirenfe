import 'reflect-metadata';
import { BadRequestException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { SesionController } from './sesion.controller';
import type { SesionService, SesionWeb } from './sesion.service';

const TOKENS = { access_token: 'at-jwt', refresh_token: 'rt-1' };
const SESION_WEB: SesionWeb = {
  access_token: 'at-jwt',
  expires_at: 2_000_000_000,
  user: {
    sub: 'u1',
    email: 'ana@example.com',
    nombre: null,
    avatarUrl: null,
    proveedor: 'email',
  },
};

function crearControlador(
  opciones: { nodeEnv?: string; servicio?: Partial<Record<keyof SesionService, unknown>> } = {},
) {
  const servicio = {
    login: vi.fn().mockResolvedValue(TOKENS),
    canjearCodigo: vi.fn().mockResolvedValue(TOKENS),
    sesionDeCookies: vi
      .fn()
      .mockResolvedValue({ sesion: null, renovado: null, cookiesInvalidas: false }),
    ...opciones.servicio,
  };
  const res = { setHeader: vi.fn() };
  const config = {
    get: (clave: string) =>
      clave === 'NODE_ENV' ? (opciones.nodeEnv ?? 'development') : undefined,
  } as unknown as ConfigService;
  const controlador = new SesionController(
    servicio as unknown as SesionService,
    config,
    res as unknown as Response,
  );
  return { controlador, servicio, res };
}

function cookiesFijadas(res: { setHeader: ReturnType<typeof vi.fn> }): string[] {
  const llamadas = res.setHeader.mock.calls.filter(([clave]) => clave === 'Set-Cookie');
  return llamadas.at(-1)?.[1] as string[];
}

describe('POST /auth/login', () => {
  it('fija mv_at y mv_rt como httpOnly y devuelve { ok: true }', async () => {
    const { controlador, servicio, res } = crearControlador();

    await expect(
      controlador.login({ email: 'ana@example.com', password: 'secreta' }),
    ).resolves.toEqual({ ok: true });

    expect(servicio.login).toHaveBeenCalledWith('ana@example.com', 'secreta');
    const cookies = cookiesFijadas(res);
    expect(cookies).toHaveLength(2);
    expect(cookies[0]).toContain('mv_at=at-jwt');
    expect(cookies[0]).toContain('Path=/;');
    expect(cookies[0]).toContain('HttpOnly');
    expect(cookies[0]).toContain('SameSite=Lax');
    expect(cookies[0]).toContain('Max-Age=3600');
    expect(cookies[1]).toContain('mv_rt=rt-1');
    expect(cookies[1]).toContain('Path=/api/auth;');
    expect(cookies[1]).toContain('HttpOnly');
    expect(cookies[1]).toContain('Max-Age=2592000');
  });

  it('en producción añade Secure a las dos', async () => {
    const { controlador, res } = crearControlador({ nodeEnv: 'production' });
    await controlador.login({ email: 'ana@example.com', password: 'secreta' });
    for (const cookie of cookiesFijadas(res)) expect(cookie).toContain('Secure');
  });

  it('rechaza entradas inválidas sin tocar Supabase', async () => {
    const { controlador, servicio } = crearControlador();
    await expect(controlador.login({ email: 'no-es-email', password: 'x' })).rejects.toThrow(
      BadRequestException,
    );
    await expect(controlador.login({ email: 'ana@example.com', password: '' })).rejects.toThrow(
      BadRequestException,
    );
    await expect(controlador.login(undefined)).rejects.toThrow(BadRequestException);
    expect(servicio.login).not.toHaveBeenCalled();
  });

  it('propaga el error de Supabase (400) tal cual llega al filtro global', async () => {
    const { controlador } = crearControlador({
      servicio: {
        login: vi.fn().mockRejectedValue(new BadRequestException('Invalid login credentials')),
      },
    });
    await expect(controlador.login({ email: 'ana@example.com', password: 'x' })).rejects.toThrow(
      'Invalid login credentials',
    );
  });
});

describe('POST /auth/callback', () => {
  it('canjea el código y fija las mismas cookies que login', async () => {
    const { controlador, servicio, res } = crearControlador();

    await expect(
      controlador.callback({ code: 'codigo-123', code_verifier: 'verifier-123456' }),
    ).resolves.toEqual({ ok: true });

    expect(servicio.canjearCodigo).toHaveBeenCalledWith('codigo-123', 'verifier-123456');
    expect(cookiesFijadas(res).join(' ')).toContain('mv_rt=rt-1');
  });

  it('valida code y code_verifier antes de llamar a Supabase', async () => {
    const { controlador, servicio } = crearControlador();
    await expect(controlador.callback({ code: '', code_verifier: 'x' })).rejects.toThrow(
      BadRequestException,
    );
    await expect(controlador.callback({ code: 'c', code_verifier: 'corto' })).rejects.toThrow(
      BadRequestException,
    );
    await expect(
      controlador.callback({ code: 'c con espacio', code_verifier: 'verifier-largo' }),
    ).rejects.toThrow(BadRequestException);
    expect(servicio.canjearCodigo).not.toHaveBeenCalled();
  });
});

describe('GET /auth/session', () => {
  function peticion(cookie?: string): Request {
    return { headers: cookie ? { cookie } : {} } as unknown as Request;
  }

  it('devuelve { session: null } sin cookies y sin setear nada', async () => {
    const { controlador, res } = crearControlador();
    await expect(controlador.session(peticion())).resolves.toEqual({ session: null });
    expect(res.setHeader).not.toHaveBeenCalledWith('Set-Cookie', expect.anything());
    // La respuesta lleva un access token en el cuerpo: nada de cachearla
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
  });

  it('lee las cookies de la cabecera y devuelve la sesión', async () => {
    const { controlador, servicio } = crearControlador({
      servicio: {
        sesionDeCookies: vi.fn().mockResolvedValue({
          sesion: SESION_WEB,
          renovado: null,
          cookiesInvalidas: false,
        }),
      },
    });

    await expect(controlador.session(peticion('mv_at=at-jwt; mv_rt=rt-1'))).resolves.toEqual({
      session: SESION_WEB,
    });
    expect(servicio.sesionDeCookies).toHaveBeenCalledWith({ mv_at: 'at-jwt', mv_rt: 'rt-1' });
  });

  it('si el servicio renueva tokens, se escriben en cookie', async () => {
    const { controlador, res } = crearControlador({
      servicio: {
        sesionDeCookies: vi.fn().mockResolvedValue({
          sesion: SESION_WEB,
          renovado: { access_token: 'at-nuevo', refresh_token: 'rt-nuevo' },
          cookiesInvalidas: false,
        }),
      },
    });

    await controlador.session(peticion('mv_at=viejo; mv_rt=rt-1'));
    expect(cookiesFijadas(res).join(' ')).toContain('mv_at=at-nuevo');
    expect(cookiesFijadas(res).join(' ')).toContain('mv_rt=rt-nuevo');
  });

  it('si las cookies están rechazadas por Supabase, las borra', async () => {
    const { controlador, res } = crearControlador({
      servicio: {
        sesionDeCookies: vi.fn().mockResolvedValue({
          sesion: null,
          renovado: null,
          cookiesInvalidas: true,
        }),
      },
    });

    await controlador.session(peticion('mv_at=viejo'));
    const cookies = cookiesFijadas(res);
    expect(cookies).toHaveLength(2);
    for (const cookie of cookies) expect(cookie).toContain('Max-Age=0');
  });
});

describe('POST /auth/logout', () => {
  it('borra las dos cookies con Max-Age=0', async () => {
    const { controlador, res } = crearControlador();
    await expect(controlador.logout()).resolves.toEqual({ ok: true });
    const cookies = cookiesFijadas(res);
    expect(cookies).toHaveLength(2);
    expect(cookies[0]).toContain('mv_at=');
    expect(cookies[1]).toContain('mv_rt=');
    for (const cookie of cookies) expect(cookie).toContain('Max-Age=0');
  });
});

describe('rate limiting', () => {
  /** Metadatos que deja `@Throttle({ default: … })` en el handler (v6). */
  function meta(handler: (...args: never[]) => unknown, clave: string): unknown {
    return Reflect.getMetadata(`THROTTLER:${clave}default`, handler);
  }

  it('login y callback admiten como mucho 10 peticiones cada 10 s', () => {
    expect(meta(SesionController.prototype.login, 'TTL')).toBe(10_000);
    expect(meta(SesionController.prototype.login, 'LIMIT')).toBe(10);
    expect(meta(SesionController.prototype.callback, 'TTL')).toBe(10_000);
    expect(meta(SesionController.prototype.callback, 'LIMIT')).toBe(10);
  });

  it('session y logout usan el límite global del módulo', () => {
    expect(meta(SesionController.prototype.session, 'TTL')).toBeUndefined();
    expect(meta(SesionController.prototype.logout, 'TTL')).toBeUndefined();
  });
});
