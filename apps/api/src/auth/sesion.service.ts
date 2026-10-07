import { BadGatewayException, BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { decodeJwt, type JWTPayload } from 'jose';
import { COOKIE_AT, COOKIE_RT, valorCookieSeguro } from './cookies';

/** Usuario empaquetado desde los claims del JWT (sin verificar firma). */
export interface UsuarioSesion {
  sub: string;
  email: string;
  nombre: string | null;
  avatarUrl: string | null;
  proveedor: string;
}

/** Lo que la web recibe en `GET /api/auth/session` (NUNCA el refresh token). */
export interface SesionWeb {
  access_token: string;
  expires_at: number;
  user: UsuarioSesion;
}

export interface TokensSupabase {
  access_token: string;
  refresh_token: string;
}

export interface ResultadoSesion {
  sesion: SesionWeb | null;
  /** Tokens nuevos que hay que escribir en cookie (refresco de `mv_rt`). */
  renovado: TokensSupabase | null;
  /** Supabase rechazó las cookies: hay que borrarlas (Max-Age=0). */
  cookiesInvalidas: boolean;
}

/** El refresh token fue rechazado por Supabase (4xx): ya no vale. */
export class RefreshInvalidoError extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = 'RefreshInvalidoError';
  }
}

type RespuestaToken =
  | { ok: true; datos: Record<string, unknown> }
  | { ok: false; status: number; mensaje: string; grantDesconocido: boolean };

const TIMEOUT_MS = 10_000;
/** Renovar el access token cuando le queden menos de 60 s (margen de la web). */
const MARGEN_RENOVACION_MS = 60_000;
const MENSAJE_CONTACTO = 'No se pudo contactar con Supabase';
const MENSAJE_FALLA = 'No se pudo iniciar la sesión';

/** Mensaje legible de una respuesta de error de Supabase, saneado. */
export function mensajeSupabase(datos: unknown): string | null {
  if (typeof datos === 'string') return saneado(datos);
  if (typeof datos !== 'object' || datos === null) return null;
  const objeto = datos as Record<string, unknown>;
  const candidatos = [objeto.error_description, objeto.msg, objeto.message, objeto.error];
  for (const candidato of candidatos) {
    if (typeof candidato === 'string' && candidato.trim() !== '') return saneado(candidato);
  }
  if (typeof objeto.error_code === 'string' && objeto.error_code !== '') {
    return saneado(objeto.error_code);
  }
  return null;
}

/** Sin HTML, sin saltos de línea y acotado: nada raro llega al cliente. */
function saneado(texto: string): string {
  return texto
    .replace(/<[^>]*>/g, ' ')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160);
}

function textoCorto(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  const limpio = valor.trim();
  return limpio === '' ? null : limpio.slice(0, 200);
}

@Injectable()
export class SesionService {
  private readonly logger = new Logger(SesionService.name);
  private readonly supabaseUrl: string;
  private readonly anonKey: string;

  constructor(config: ConfigService) {
    // MISMA fuente que JwtAuthGuard (issuer/`SUPABASE_URL`): si los dos
    // apuntaran a proyectos distintos, los tokens de cookie no los aceptaría
    // el guard. La URL por VITE_ es el respaldo en quien solo exporta esa.
    this.supabaseUrl = (
      textoConfig(config, 'SUPABASE_URL') ??
      textoConfig(config, 'VITE_SUPABASE_URL') ??
      ''
    ).replace(/\/+$/, '');
    this.anonKey =
      textoConfig(config, 'VITE_SUPABASE_ANON_KEY') ??
      textoConfig(config, 'SUPABASE_ANON_KEY') ??
      '';
  }

  async login(email: string, password: string): Promise<TokensSupabase> {
    return this.tokensOError(await this.solicitarToken('password', { email, password }));
  }

  /**
   * Canje del código PKCE. auth-js (2.117) envía `grant_type=pkce` y es lo que
   * hoy funciona contra el proyecto; `pkce_code` es el nombre histórico de
   * GoTrue. Si el primero responde «grant desconocido» se pruebe el otro, así
   * la cookie funciona con cualquier versión del backend.
   */
  async canjearCodigo(code: string, codeVerifier: string): Promise<TokensSupabase> {
    const cuerpo = { auth_code: code, code_verifier: codeVerifier };
    const primero = await this.solicitarToken('pkce', cuerpo);
    if (primero.ok) return this.extraerTokens(primero.datos);
    if (primero.grantDesconocido) {
      const segundo = await this.solicitarToken('pkce_code', cuerpo);
      if (segundo.ok) return this.extraerTokens(segundo.datos);
      throw this.errorDeFallo(segundo);
    }
    throw this.errorDeFallo(primero);
  }

  /** Forma de un refresh token de Supabase: charset compacto,16..512 chars. */
  private static readonly FORMATO_RT = /^[\w.:+/-]{16,512}$/;

  async refrescar(refreshToken: string): Promise<TokensSupabase> {
    // Cualquier cookie no vacía pasaría `valorCookieSeguro`: sin este filtro,
    // un atacante martillea el endpoint de Auth de Supabase desde nuestra IP
    // (amplificación) con basura en mv_rt.
    if (!valorCookieSeguro(refreshToken) || !SesionService.FORMATO_RT.test(refreshToken)) {
      throw new RefreshInvalidoError('Refresh token inválido');
    }
    const respuesta = await this.solicitarToken('refresh_token', { refresh_token: refreshToken });
    if (respuesta.ok) return this.extraerTokens(respuesta.datos);
    if (respuesta.status >= 400 && respuesta.status < 500) {
      throw new RefreshInvalidoError(respuesta.mensaje);
    }
    throw new BadGatewayException(MENSAJE_CONTACTO);
  }

  /**
   * Sesión a partir de las cookies del BFF. Si `mv_at` sigue vigente se usa
   * tal cual; si no, se renueva con `mv_rt` (sin él, la sesión moriría a la
   * hora aunque el refresh siga vivo 30 días).
   */
  async sesionDeCookies(cookies: Record<string, string>): Promise<ResultadoSesion> {
    const access = cookies[COOKIE_AT];
    const refresh = cookies[COOKIE_RT];

    if (access) {
      // Con margen: si el access está a punto de caducar se renueva ya, para
      // que la web no reciba un token que `tokenEnMemoria.vigente()` (60 s de
      // margen) rechazaría y obligaría a repetir la llamada.
      const propia = this.sesionDesdeToken(access, MARGEN_RENOVACION_MS);
      if (propia) return { sesion: propia, renovado: null, cookiesInvalidas: false };
    }

    if (!refresh) {
      // Access caducado (o corrupto) sin refresh: no queda nada que rescatar.
      return { sesion: null, renovado: null, cookiesInvalidas: access !== undefined };
    }

    try {
      const tokens = await this.refrescar(refresh);
      const sesion = this.sesionDesdeToken(tokens.access_token);
      if (!sesion) return { sesion: null, renovado: null, cookiesInvalidas: true };
      return { sesion, renovado: tokens, cookiesInvalidas: false };
    } catch (error) {
      if (error instanceof RefreshInvalidoError) {
        return { sesion: null, renovado: null, cookiesInvalidas: true };
      }
      // Supabase inaccesible: ni se emiten cookies nuevas ni se borran las
      // viejas (un corte de red no debe expulsar a nadie).
      this.logger.warn(
        `No se pudo refrescar la sesión: ${error instanceof Error ? error.message : error}`,
      );
      return { sesion: null, renovado: null, cookiesInvalidas: false };
    }
  }

  /**
   * Revoca la sesión en Supabase antes de borrar las cookies: sin esto, un
   * `mv_rt` copiado seguiría renovando30 días desde cualquier sitio.
   *
   *  - `mv_at` válido y vigente → `POST /auth/v1/logout` (scope global).
   *  - Si no lo está → se renueva con `mv_rt` y se revoca con el access nuevo
   *    (de paso rota el refresh token, que queda invalidado).
   *  - Cualquier fallo es solo un `logger.warn`: NUNCA puede romper el
   *    borrado de cookies que hace el controller.
   */
  async revocarSesion(cookies: Record<string, string>): Promise<void> {
    const refresh = cookies[COOKIE_RT];
    if (!refresh) return;
    if (!this.supabaseUrl || !this.anonKey) {
      this.logger.warn('No se pudo revocar la sesión: Supabase no está configurado');
      return;
    }

    const vigente = this.sesionDesdeToken(cookies[COOKIE_AT] ?? '');
    let access = vigente?.access_token;

    if (!access) {
      try {
        access = (await this.refrescar(refresh)).access_token;
      } catch (error) {
        this.logger.warn(`No se pudo revocar la sesión: ${textoError(error)}`);
        return;
      }
    }

    try {
      const respuesta = await fetch(`${this.supabaseUrl}/auth/v1/logout`, {
        method: 'POST',
        headers: {
          apikey: this.anonKey,
          Authorization: `Bearer ${access}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ scope: 'global' }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!respuesta.ok) {
        this.logger.warn(`Supabase rechazó el logout (HTTP ${respuesta.status})`);
      }
    } catch (error) {
      this.logger.warn(`No se pudo revocar la sesión: ${textoError(error)}`);
    }
  }

  /**
   * Lee el JWT SIN verificar la firma (la verificación real la hace
   * `JwtAuthGuard` en cada petición autenticada): basta `sub` + `exp` + `iss`
   * para decir si la cookie sigue viva.
   */
  sesionDesdeToken(token: string, margenMs = 0): SesionWeb | null {
    if (!valorCookieSeguro(token)) return null;
    let payload: JWTPayload;
    try {
      payload = decodeJwt(token);
    } catch {
      return null;
    }
    if (typeof payload.sub !== 'string' || payload.sub === '') return null;
    if (typeof payload.exp !== 'number' || payload.exp * 1000 <= Date.now() + margenMs) return null;
    if (this.supabaseUrl) {
      // Sin `iss` el token no es nuestro: se rechaza en vez de aceptarlo a ciegas
      if (payload.iss !== `${this.supabaseUrl}/auth/v1`) return null;
    }
    if (payload.aud !== undefined && payload.aud !== null && payload.aud !== 'authenticated') {
      return null;
    }
    const metadata = (payload.user_metadata ?? {}) as Record<string, unknown>;
    const appMetadata = (payload.app_metadata ?? {}) as Record<string, unknown>;
    const proveedor = textoCorto(appMetadata.provider);
    return {
      access_token: token,
      expires_at: payload.exp,
      user: {
        sub: payload.sub,
        email: typeof payload.email === 'string' ? payload.email : '',
        nombre: textoCorto(metadata.full_name),
        avatarUrl: textoCorto(metadata.avatar_url),
        proveedor: proveedor ?? 'email',
      },
    };
  }

  private async solicitarToken(grant: string, cuerpo: unknown): Promise<RespuestaToken> {
    if (!this.supabaseUrl || !this.anonKey) {
      throw new BadGatewayException('Supabase no está configurado en la API');
    }
    let respuesta: Response;
    try {
      respuesta = await fetch(`${this.supabaseUrl}/auth/v1/token?grant_type=${grant}`, {
        method: 'POST',
        headers: {
          apikey: this.anonKey,
          Authorization: `Bearer ${this.anonKey}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(cuerpo),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      throw new BadGatewayException(MENSAJE_CONTACTO);
    }

    const datos = await leerJson(respuesta);
    if (respuesta.ok) {
      if (typeof datos !== 'object' || datos === null) {
        throw new BadGatewayException('Respuesta inesperada de Supabase');
      }
      return { ok: true, datos: datos as Record<string, unknown> };
    }

    const mensaje = mensajeSupabase(datos) ?? MENSAJE_FALLA;
    const detalle = `${mensaje} ${JSON.stringify(datos ?? '')}`;
    return {
      ok: false,
      status: respuesta.status,
      mensaje,
      grantDesconocido: respuesta.status === 400 && /grant/i.test(detalle),
    };
  }

  private tokensOError(respuesta: RespuestaToken): TokensSupabase {
    if (respuesta.ok) return this.extraerTokens(respuesta.datos);
    throw this.errorDeFallo(respuesta);
  }

  private errorDeFallo(respuesta: Extract<RespuestaToken, { ok: false }>): Error {
    if (respuesta.status >= 400 && respuesta.status < 500) {
      return new BadRequestException(respuesta.mensaje);
    }
    return new BadGatewayException(MENSAJE_CONTACTO);
  }

  private extraerTokens(datos: Record<string, unknown>): TokensSupabase {
    const access = datos.access_token;
    const refresh = datos.refresh_token;
    if (!valorCookieSeguro(access) || !valorCookieSeguro(refresh)) {
      throw new BadGatewayException('Respuesta inesperada de Supabase');
    }
    return { access_token: access, refresh_token: refresh };
  }
}

function textoConfig(config: ConfigService, clave: string): string | undefined {
  const valor = config.get<string>(clave);
  if (typeof valor !== 'string') return undefined;
  const limpio = valor.trim();
  return limpio === '' ? undefined : limpio;
}

/** Mensaje de un error listo para un `logger.warn` (sin volcar el stack). */
function textoError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function leerJson(respuesta: Response): Promise<unknown> {
  const texto = await respuesta.text().catch(() => '');
  if (texto === '') return null;
  try {
    return JSON.parse(texto) as unknown;
  } catch {
    return texto;
  }
}
