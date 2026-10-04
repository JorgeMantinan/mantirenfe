import { i18n } from '@/i18n';
import { supabase } from './supabase';

export class ErrorApi extends Error {
  constructor(
    public readonly status: number,
    mensaje: string,
  ) {
    super(mensaje);
  }
}

/** Timeout por defecto de todas las llamadas de la API. */
const TIMEOUT_MS = 15_000;

interface SignalPreparada {
  signal: AbortSignal | undefined;
  limpiar: () => void;
}

/**
 * Une el timeout con la señal que traiga el llamante. Si el navegador
 * soporta `AbortSignal.any` se delega en él; si no, se replica el mismo
 * comportamiento con un `AbortController` + `setTimeout`.
 */
function signalConTimeout(externa?: AbortSignal | null): SignalPreparada {
  const soportaTimeout =
    typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function';

  if (soportaTimeout && typeof AbortSignal.any === 'function') {
    const limite = AbortSignal.timeout(TIMEOUT_MS);
    return {
      signal: externa ? AbortSignal.any([limite, externa]) : limite,
      limpiar: () => undefined,
    };
  }

  const combinada = new AbortController();
  const temporizador = setTimeout(() => {
    if (!combinada.signal.aborted) {
      combinada.abort(new DOMException('Tiempo de espera agotado', 'TimeoutError'));
    }
  }, TIMEOUT_MS);
  const alExterno = () => {
    if (!combinada.signal.aborted) combinada.abort(externa?.reason);
  };
  if (externa) {
    if (externa.aborted) combinada.abort(externa.reason);
    else externa.addEventListener('abort', alExterno, { once: true });
  }
  return {
    signal: combinada.signal,
    limpiar: () => {
      clearTimeout(temporizador);
      externa?.removeEventListener('abort', alExterno);
    },
  };
}

/** ¿La falla viene de un aborto (nuestro timeout o el cancelador del llamante)? */
function esCancelacion(error: unknown): boolean {
  return error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError');
}

/** Mensaje i18n para un status HTTP (nunca el texto crudo del servidor). */
function mensajeParaStatus(status: number): string {
  const claves = {
    400: 'errores.status400',
    401: 'errores.status401',
    403: 'errores.status403',
    404: 'errores.status404',
    409: 'errores.status409',
    429: 'errores.status429',
  } as const;
  const clave = claves[status as keyof typeof claves];
  if (clave) return i18n.t(clave);
  if (status >= 500) return i18n.t('errores.status500');
  return i18n.t('errores.status', { status });
}

/**
 * Detalle corto que el backend puede devolver en `{ message }` o `{ error }`:
 * solo se usa si es una cadena corta y no parece un fallo de base de datos.
 */
function detalleUtil(datos: unknown): string | null {
  const objeto = datos as { message?: unknown; error?: unknown } | null;
  const candidato =
    typeof objeto?.message === 'string'
      ? objeto.message
      : typeof objeto?.error === 'string'
        ? objeto.error
        : null;
  if (!candidato) return null;
  const texto = candidato.trim();
  if (texto.length === 0 || texto.length > 120) return null;
  if (texto.startsWith('<')) return null;
  if (
    /\b(sql|select|insert|update|delete|union|syntax|constraint|column|relation|pg_[a-z]+|sqlite)\b/i.test(
      texto,
    )
  ) {
    return null;
  }
  return texto;
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
    throw new ErrorApi(401, i18n.t('errores.sinSesion'));
  }
  const headers = new Headers(opciones.headers);
  headers.set('Accept', 'application/json');
  if (opciones.json !== undefined) {
    headers.set('Content-Type', 'application/json');
  }
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const { signal, limpiar } = signalConTimeout(opciones.signal);

  try {
    const respuesta = await fetch(`/api${ruta}`, {
      ...opciones,
      signal,
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
      // El detalle crudo solo a consola: la UI pinta un mensaje i18n del status
      console.error(`API ${ruta} → ${respuesta.status}`, datos);
      throw new ErrorApi(
        respuesta.status,
        detalleUtil(datos) ?? mensajeParaStatus(respuesta.status),
      );
    }

    return datos as T;
  } catch (e) {
    if (esCancelacion(e)) {
      // Cancelación del llamante (limpieza de la página): se propaga tal cual
      if (opciones.signal?.aborted) throw e;
      throw new Error(i18n.t('errores.timeout'));
    }
    throw e;
  } finally {
    limpiar();
  }
}
