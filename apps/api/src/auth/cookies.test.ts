import { describe, expect, it } from 'vitest';
import {
  COOKIE_AT,
  COOKIE_RT,
  VIDA_AT_SEGUNDOS,
  VIDA_RT_SEGUNDOS,
  cookiesBorrado,
  cookiesSeguras,
  cookiesSesion,
  cookieSesion,
  leerCookies,
  valorCookieSeguro,
} from './cookies';

const JWT = 'eyJhbGciOiJFUzI1NiJ9.eyJzdWIiOiJ1MSJ9.eyJzaWduYXR1cmUiOiJ4In0';
const TOKENS = { access_token: JWT, refresh_token: 'rt_abc-123' };

describe('valorCookieSeguro', () => {
  it('acepta tokens tipo JWT (letras, números, -_. y punto)', () => {
    expect(valorCookieSeguro(JWT)).toBe(true);
    expect(valorCookieSeguro('rt_abc-123')).toBe(true);
  });

  it('rechaza separadores que permitirían inyectar atributos', () => {
    expect(valorCookieSeguro('a; Path=/admin')).toBe(false);
    expect(valorCookieSeguro('a b')).toBe(false);
    expect(valorCookieSeguro('a"b')).toBe(false);
    expect(valorCookieSeguro('a\nb')).toBe(false);
    expect(valorCookieSeguro('')).toBe(false);
    expect(valorCookieSeguro(undefined)).toBe(false);
    expect(valorCookieSeguro('x'.repeat(4097))).toBe(false);
  });
});

describe('cookiesSeguras', () => {
  it('marca Secure solo en producción', () => {
    expect(cookiesSeguras('production')).toBe(true);
    expect(cookiesSeguras('development')).toBe(false);
    expect(cookiesSeguras(undefined)).toBe(false);
  });
});

describe('cookieSesion', () => {
  it('construye la cookie con Path, HttpOnly, SameSite y Max-Age', () => {
    const cookie = cookieSesion(COOKIE_AT, JWT, { path: '/', maxAge: 60, secure: false });
    expect(cookie).toBe(`mv_at=${JWT}; Path=/; HttpOnly; SameSite=Lax; Max-Age=60`);
  });

  it('añade Secure cuando se pide', () => {
    const cookie = cookieSesion(COOKIE_AT, JWT, { path: '/', maxAge: 60, secure: true });
    expect(cookie).toContain('Secure');
  });

  it('lanza si el valor no es seguro (no se puede inyectar nada)', () => {
    expect(() =>
      cookieSesion(COOKIE_AT, 'a; Domain=evil.test', { path: '/', maxAge: 60, secure: false }),
    ).toThrow('no seguro');
  });
});

describe('cookiesSesion', () => {
  it('emite mv_at (Path=/) y mv_rt (Path=/api/auth) con sus vidas', () => {
    const cookies = cookiesSesion(TOKENS, false);
    expect(cookies).toHaveLength(2);

    const [at, rt] = cookies;
    expect(at).toContain(`mv_at=${JWT}`);
    expect(at).toContain('Path=/;');
    expect(at).toContain('HttpOnly');
    expect(at).toContain('SameSite=Lax');
    expect(at).toContain(`Max-Age=${VIDA_AT_SEGUNDOS}`);
    expect(at).not.toContain('Secure');

    expect(rt).toContain(`mv_rt=${TOKENS.refresh_token}`);
    expect(rt).toContain('Path=/api/auth;');
    expect(rt).toContain('HttpOnly');
    expect(rt).toContain(`Max-Age=${VIDA_RT_SEGUNDOS}`);
    expect(rt).not.toContain('Secure');
  });

  it('en producción ambas cookies llevan Secure', () => {
    for (const cookie of cookiesSesion(TOKENS, true)) {
      expect(cookie).toContain('Secure');
    }
  });
});

describe('cookiesBorrado', () => {
  it('borra las dos cookies con Max-Age=0 y los mismos Path que el alta', () => {
    const cookies = cookiesBorrado(false);
    expect(cookies).toHaveLength(2);
    const [at, rt] = cookies;
    expect(at).toContain('mv_at=');
    expect(at).toContain('Path=/;');
    expect(at).toContain('Max-Age=0');
    expect(rt).toContain('mv_rt=');
    expect(rt).toContain('Path=/api/auth;');
    expect(rt).toContain('Max-Age=0');
    for (const cookie of cookies) expect(cookie).toContain('HttpOnly');
  });
});

describe('leerCookies', () => {
  it('parsea la cabecera Cookie en un objeto plano', () => {
    expect(leerCookies(`mv_at=${JWT}; mv_rt=rt_abc`)).toEqual({
      mv_at: JWT,
      mv_rt: 'rt_abc',
    });
  });

  it('tolera valores con «=», espacios alrededor y sin cabecera', () => {
    expect(leerCookies(' mv_at = a=b=c ')).toEqual({ mv_at: 'a=b=c' });
    expect(leerCookies(undefined)).toEqual({});
    expect(leerCookies('')).toEqual({});
    expect(leerCookies('sin-igual')).toEqual({});
  });
});
