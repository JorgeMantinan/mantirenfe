import { t } from '../i18n';
import { supabase } from './supabase';

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000/api';

/** Ninguna petición de la app debería tardar más de 10 s: cortamos antes. */
const TIMEOUT_MS = 10_000;

export class ErrorApi extends Error {
  constructor(
    public readonly status: number,
    mensaje: string,
  ) {
    super(mensaje);
  }
}

async function obtenerToken(): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

export async function api<T>(
  ruta: string,
  opciones: RequestInit & { json?: unknown } = {},
): Promise<T> {
  const { json, signal, ...resto } = opciones;
  const token = await obtenerToken();
  const headers = new Headers(resto.headers);
  headers.set('Accept', 'application/json');
  if (json !== undefined) {
    headers.set('Content-Type', 'application/json');
  }
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  // Timeout propio + señal del llamante (p. ej. desmontar una pantalla):
  // las dos acaban abortando el mismo controlador.
  const controlador = new AbortController();
  let agotado = false;
  const tiempo = setTimeout(() => {
    agotado = true;
    controlador.abort();
  }, TIMEOUT_MS);
  const abortar = () => controlador.abort();
  if (signal) {
    if (signal.aborted) controlador.abort();
    else signal.addEventListener('abort', abortar, { once: true });
  }

  try {
    const respuesta = await fetch(`${API_URL}${ruta}`, {
      ...resto,
      headers,
      signal: controlador.signal,
      body: json !== undefined ? JSON.stringify(json) : resto.body,
    });

    if (respuesta.status === 204) {
      return undefined as T;
    }

    const texto = await respuesta.text();
    let datos: unknown = null;
    if (texto) {
      try {
        datos = JSON.parse(texto);
      } catch {
        datos = { error: texto };
      }
    }

    if (!respuesta.ok) {
      const error = (datos as { error?: unknown } | null)?.error;
      const mensaje =
        error && typeof error === 'object'
          ? JSON.stringify(error)
          : typeof error === 'string'
            ? error
            : `Error ${respuesta.status}`;
      throw new ErrorApi(respuesta.status, mensaje);
    }

    return datos as T;
  } catch (e) {
    // Un error HTTP real (ErrorApi) manda sobre el timeout: solo el corte
    // del propio fetch se traduce a un mensaje nuestro de i18n
    if (agotado && !(e instanceof ErrorApi)) throw new Error(t('comunes.timeout'));
    throw e;
  } finally {
    clearTimeout(tiempo);
    signal?.removeEventListener('abort', abortar);
  }
}
