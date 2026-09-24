import { supabase } from './supabase';

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000/api';

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
  const token = await obtenerToken();
  const headers = new Headers(opciones.headers);
  headers.set('Accept', 'application/json');
  if (opciones.json !== undefined) {
    headers.set('Content-Type', 'application/json');
  }
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const respuesta = await fetch(`${API_URL}${ruta}`, {
    ...opciones,
    headers,
    body: opciones.json !== undefined ? JSON.stringify(opciones.json) : opciones.body,
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
}
