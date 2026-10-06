/**
 * Contrato de cookies httpOnly de la sesión (BFF de cookies con fallback).
 *
 *  - `mv_at` → access token de Supabase. `Path=/` para que la pueda leer
 *    cualquier endpoint de la API si algún día se autentica por cookie.
 *  - `mv_rt` → refresh token. `Path=/api/auth` acota su exposición a los
 *    endpoints del BFF (login/logout/session/callback).
 *
 * Ambas: `HttpOnly` (JS no las lee), `SameSite=Lax` (no viajan en POST de
 * terceros → CSRF) y `Secure` fuera de desarrollo. El access token NO se
 * devuelve jamás en una cookie leíble por JS: la web lo recibe en el cuerpo
 * de `GET /api/auth/session` y lo guarda SOLO en memoria.
 */
export const COOKIE_AT = 'mv_at';
export const COOKIE_RT = 'mv_rt';

/** 1 hora: misma vida que el access token de Supabase. */
export const VIDA_AT_SEGUNDOS = 60 * 60;
/** 30 días: vida del refresh token. */
export const VIDA_RT_SEGUNDOS = 60 * 60 * 24 * 30;

export interface AtributosCookie {
  path: string;
  maxAge: number;
  secure: boolean;
}

/**
 * Un valor apto para `Set-Cookie`: sin separadores (`;`), sin comillas, sin
 * espacios ni caracteres de control. Un JWT de Supabase entra de sobra; lo que
 * queremos es que una respuesta torcida de Supabase no pueda inyectar
 * atributos extra en la cookie.
 */
export function valorCookieSeguro(valor: unknown): valor is string {
  if (typeof valor !== 'string') return false;
  if (valor.length === 0 || valor.length > 4096) return false;
  return !/[\s;"\\]/.test(valor) && !/[\x00-\x1f\x7f]/.test(valor);
}

/** `Secure` solo en producción: en local (http) rompería el login. */
export function cookiesSeguras(nodeEnv: string | undefined): boolean {
  return nodeEnv === 'production';
}

export function cookieSesion(nombre: string, valor: string, atributos: AtributosCookie): string {
  if (!valorCookieSeguro(valor)) {
    throw new Error(`Valor no seguro para la cookie ${nombre}`);
  }
  const partes = [`${nombre}=${valor}`, `Path=${atributos.path}`, 'HttpOnly', 'SameSite=Lax'];
  if (atributos.secure) partes.push('Secure');
  partes.push(`Max-Age=${Math.max(0, Math.trunc(atributos.maxAge))}`);
  return partes.join('; ');
}

/** Las dos cookies de sesión (access + refresh) listas para `Set-Cookie`. */
export function cookiesSesion(
  tokens: { access_token: string; refresh_token: string },
  secure: boolean,
): string[] {
  return [
    cookieSesion(COOKIE_AT, tokens.access_token, {
      path: '/',
      maxAge: VIDA_AT_SEGUNDOS,
      secure,
    }),
    cookieSesion(COOKIE_RT, tokens.refresh_token, {
      path: '/api/auth',
      maxAge: VIDA_RT_SEGUNDOS,
      secure,
    }),
  ];
}

/** Borrado de las dos cookies (mismos Path/atributos que el alta). */
export function cookiesBorrado(secure: boolean): string[] {
  return [cookieVacia(COOKIE_AT, '/', secure), cookieVacia(COOKIE_RT, '/api/auth', secure)];
}

function cookieVacia(nombre: string, path: string, secure: boolean): string {
  const partes = [`${nombre}=`, `Path=${path}`, 'HttpOnly', 'SameSite=Lax'];
  if (secure) partes.push('Secure');
  partes.push('Max-Age=0');
  return partes.join('; ');
}

/** Cabecera `Cookie` de la petición → objeto plano (valores decodificados). */
export function leerCookies(encabezado?: string): Record<string, string> {
  const resultado: Record<string, string> = {};
  if (!encabezado) return resultado;
  for (const trozo of encabezado.split(';')) {
    const separador = trozo.indexOf('=');
    if (separador < 1) continue;
    const nombre = trozo.slice(0, separador).trim();
    if (nombre === '') continue;
    const valor = trozo.slice(separador + 1).trim();
    try {
      resultado[nombre] = decodeURIComponent(valor);
    } catch {
      resultado[nombre] = valor;
    }
  }
  return resultado;
}
