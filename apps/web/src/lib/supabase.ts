import { createClient, type Session, type SupabaseClient, type User } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase: SupabaseClient | null = url && anonKey ? createClient(url, anonKey) : null;

export const authConfigurada = Boolean(supabase);

/** Origen de la sesión activa: la cookie httpOnly del BFF o supabase-js (legado). */
export type FuenteSesion = 'cookie' | 'supabase';

/** Usuario que devuelve `GET /api/auth/session` (desde los claims del JWT). */
export interface UsuarioCookie {
  sub: string;
  email: string;
  nombre: string | null;
  avatarUrl: string | null;
  proveedor: string;
}

export interface SesionCookie {
  access_token: string;
  expires_at: number;
  user: UsuarioCookie;
}

export interface ResultadoCookie {
  ok: boolean;
  /** Mensaje saneado del BFF para mostrar; ausente si fue un fallo de red. */
  mensaje?: string;
}

/* ------------------------------------------------------------------ */
/* Token en memoria: NUNCA se escribe en localStorage. Lo alimenta el  */
/* arranque (/api/auth/session), el login por cookie y la web legada   */
/* (sesión de supabase-js); lib/api.ts lo lee como Bearer.            */
/* ------------------------------------------------------------------ */

let tokenActual: string | null = null;
let expiraEnMs = 0;
/** Cortesía para no martillear /api/auth/session cuando no hay sesión. */
let sinSesionHasta = 0;

export const tokenEnMemoria = {
  fijar(token: string): void {
    tokenActual = token;
    expiraEnMs = expiracionDe(token) ?? Date.now() + 3_600_000;
    sinSesionHasta = 0;
  },
  /** `null` si no hay token o está a punto de caducar (margen de 60 s). */
  vigente(margenMs = 60_000): string | null {
    if (!tokenActual) return null;
    if (expiraEnMs !== 0 && expiraEnMs <= Date.now() + margenMs) return null;
    return tokenActual;
  },
  limpiar(): void {
    tokenActual = null;
    expiraEnMs = 0;
    sinSesionHasta = 0;
  },
};

/** Decodifica el payload de un JWT SIN verificar la firma (solo lectura). */
export function decodificarJwt(token: string): Record<string, unknown> | null {
  const partes = token.split('.');
  if (partes.length < 3 || !partes[1]) return null;
  try {
    const base64 = partes[1].replace(/-/g, '+').replace(/_/g, '/');
    const relleno = '='.repeat((4 - (base64.length % 4)) % 4);
    const binario = atob(base64 + relleno);
    const bytes = Uint8Array.from(binario, (caracter) => caracter.charCodeAt(0));
    const datos = JSON.parse(new TextDecoder().decode(bytes)) as unknown;
    return typeof datos === 'object' && datos !== null ? (datos as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function expiracionDe(token: string): number | null {
  const exp = decodificarJwt(token)?.exp;
  return typeof exp === 'number' ? exp * 1000 : null;
}

/**
 * Mapeos hacia los tipos de supabase-js: la app solo lee `user.email` y
 * `user.app_metadata.provider`, pero el contexto tipa `Session`/`User`.
 */
export function usuarioDeCookie(datos: UsuarioCookie): User {
  return {
    id: datos.sub,
    aud: 'authenticated',
    email: datos.email,
    app_metadata: { provider: datos.proveedor },
    user_metadata: { full_name: datos.nombre ?? '', avatar_url: datos.avatarUrl ?? '' },
  } as unknown as User;
}

export function sesionDeCookie(datos: SesionCookie): Session {
  return {
    access_token: datos.access_token,
    // El refresh token vive SOLO en la cookie httpOnly: la web no lo necesita
    refresh_token: '',
    expires_at: datos.expires_at,
    token_type: 'bearer',
    user: usuarioDeCookie(datos.user),
  } as unknown as Session;
}

/* ------------------------------- BFF ------------------------------ */

let consultaEnCurso: Promise<SesionCookie | null> | null = null;

/**
 * `GET /api/auth/session`: si hay cookie válida (o renovable con mv_rt) la
 * devuelve y fija el access token en memoria. Sin sesión → `null` (y durante
 * 3 s se recuerda, para no repetir la llamada en cada petición fallida).
 * Nunca lanza: el caller decide el fallback.
 */
export async function consultarSesionCookie(): Promise<SesionCookie | null> {
  if (Date.now() < sinSesionHasta) return null;
  if (consultaEnCurso) return consultaEnCurso;

  consultaEnCurso = (async () => {
    try {
      const respuesta = await fetch('/api/auth/session', {
        headers: { Accept: 'application/json' },
        credentials: 'same-origin',
      });
      if (!respuesta.ok) return null;
      const datos = (await respuesta.json()) as { session?: SesionCookie | null } | null;
      const sesion = datos?.session;
      if (!sesion?.access_token) {
        sinSesionHasta = Date.now() + 3_000;
        return null;
      }
      tokenEnMemoria.fijar(sesion.access_token);
      return sesion;
    } catch {
      // Sin red (offline, API caída): que decida el fallback de supabase-js
      return null;
    } finally {
      consultaEnCurso = null;
    }
  })();

  return consultaEnCurso;
}

const TIMEOUT_PETICION = 15_000;

function signalLimite(): AbortSignal | undefined {
  return typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
    ? AbortSignal.timeout(TIMEOUT_PETICION)
    : undefined;
}

async function postJson(ruta: string, cuerpo: unknown): Promise<ResultadoCookie> {
  try {
    const respuesta = await fetch(ruta, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(cuerpo),
      credentials: 'same-origin',
      signal: signalLimite(),
    });
    if (respuesta.ok) {
      // Una operación de sesión con éxito invalida el «sin sesión» memorizado
      sinSesionHasta = 0;
      return { ok: true };
    }
    const texto = await respuesta.text().catch(() => '');
    return { ok: false, mensaje: mensajeDeError(texto) };
  } catch {
    // Red caída o timeout: sin mensaje, el caller prueba el flujo de supabase-js
    return { ok: false };
  }
}

/** `POST /api/auth/login` → cookies httpOnly. Fallback a cargo de useAuth. */
export function loginConCookie(email: string, password: string): Promise<ResultadoCookie> {
  return postJson('/api/auth/login', { email, password });
}

/** `POST /api/auth/callback` → canjea el código PKCE y pone las cookies. */
export function canjearCodigoConCookie(
  code: string,
  codeVerifier: string,
): Promise<ResultadoCookie> {
  return postJson('/api/auth/callback', { code, code_verifier: codeVerifier });
}

/** `POST /api/auth/logout` a ciegas: no bloquea el cierre de sesión. */
export async function cerrarSesionCookie(): Promise<void> {
  try {
    await fetch('/api/auth/logout', {
      method: 'POST',
      credentials: 'same-origin',
      signal: signalLimite(),
    });
  } catch {
    // Mejor esfuerzo: si falla, la cookie caduca por su Max-Age
  }
}

/** Lee `{ message }`/`{ error }` del filtro global de la API (texto corto). */
function mensajeDeError(texto: string): string | undefined {
  if (texto === '') return undefined;
  try {
    const datos = JSON.parse(texto) as { message?: unknown; error?: unknown } | null;
    const candidato =
      typeof datos?.message === 'string'
        ? datos.message
        : typeof datos?.error === 'string'
          ? datos.error
          : null;
    if (candidato && candidato.trim() !== '' && candidato.length <= 200) return candidato;
  } catch {
    // Cuerpos que no son JSON: no se enseñan crudos en la UI
  }
  return undefined;
}

/* -------------------------- PKCE (OAuth) -------------------------- */

/** Clave de storage que usa supabase-js por defecto (`sb-<ref>-auth-token`). */
export function claveStorageSupabase(destino = url): string {
  if (destino) {
    try {
      return `sb-${new URL(destino).hostname.split('.')[0]}-auth-token`;
    } catch {
      // URL inválida: se usa la clave fija por defecto de auth-js
    }
  }
  return 'supabase.auth.token';
}

/**
 * B6: borra la clave legada de la sesión de supabase-js en `localStorage`
 * cuando la sesión vive en la cookie httpOnly (el token ya caducado no debe
 * quedarse ahí). Solo se llama desde los flujos que acaban en modo cookie; los
 * que usan el fallback de supabase-js NO la borran porque ahí esa clave ES la
 * sesión. Tolerante al modo privado: si el storage lanza, no se rompe nada.
 */
export function borrarSesionLegacy(
  almacen?: Pick<Storage, 'removeItem'> | null,
  claveAlmacen?: string,
): void {
  const destino = almacen ?? (typeof localStorage === 'undefined' ? null : localStorage);
  if (!destino) return;
  try {
    destino.removeItem(claveAlmacen ?? claveStorageSupabase());
  } catch {
    // Storage bloqueado (modo privado): no hay nada que limpiar a mano
  }
}

/**
 * El `code_verifier` del flujo PKCE vive en el storage del navegador y lo
 * escribe supabase-js: con él la web puede canjear el código contra
 * `POST /api/auth/callback` (cookies) en vez de contra supabase-js.
 * auth-js guarda el slot del flujo (`sb_flow_id` en la URL) y, en paralelo,
 * la clave fija; el valor es «verifier» o «verifier/recovery».
 */
export function leerCodeVerifierPkce(
  busqueda?: string,
  almacen?: Pick<Storage, 'getItem'> | null,
  claveAlmacen?: string,
): string | null {
  const consulta = busqueda ?? (typeof window === 'undefined' ? '' : window.location.search);
  const flujo = new URLSearchParams(consulta).get('sb_flow_id');
  const prefijo = claveAlmacen ?? claveStorageSupabase();
  const claves: string[] = [];
  if (flujo && /^[A-Za-z0-9_-]{1,64}$/.test(flujo)) {
    claves.push(`${prefijo}-flow-${flujo}-code-verifier`);
  }
  claves.push(`${prefijo}-code-verifier`);

  const destino = almacen ?? (typeof localStorage === 'undefined' ? null : localStorage);
  if (!destino) return null;

  for (const clave of claves) {
    const guardado = destino.getItem(clave);
    if (typeof guardado !== 'string' || guardado === '') continue;
    const verifier = guardado.split('/')[0];
    if (verifier) return verifier;
  }
  return null;
}
