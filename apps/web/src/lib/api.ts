import { supabase } from './supabase';

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
  const rutasPublicas = [
    '/estaciones',
    '/incidencias',
    '/suprimidos',
    '/trenes/horarios',
    '/trenes/estacion',
    '/trenes/posiciones',
    '/health',
  ];
  const esPublica = rutasPublicas.some((r) => ruta.startsWith(r));
  if (!token && !esPublica) {
    // Falla en local para no mandar una petición que sabemos que será 401
    throw new ErrorApi(401, 'No hay sesión activa: inicia sesión de nuevo');
  }
  const headers = new Headers(opciones.headers);
  headers.set('Accept', 'application/json');
  if (opciones.json !== undefined) {
    headers.set('Content-Type', 'application/json');
  }
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const respuesta = await fetch(`/api${ruta}`, {
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
    const mensaje =
      (datos as { error?: string | { message?: string } } | null)?.error instanceof Object
        ? JSON.stringify((datos as { error: unknown }).error)
        : ((datos as { error?: string } | null)?.error ?? `Error ${respuesta.status}`);
    throw new ErrorApi(respuesta.status, typeof mensaje === 'string' ? mensaje : 'Error');
  }

  return datos as T;
}
