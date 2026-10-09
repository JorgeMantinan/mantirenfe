import { i18n } from '@/i18n';
import { consultarSesionCookie, supabase, tokenEnMemoria } from './supabase';

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

/** Cuánto vale una respuesta GET en memoria (ms): dedupe + frescura corta. */
const TTL_GET_MS = 5_000;

interface EntradaGet {
  /**
   * Promesa compartida: mientras está en vuelo la usan todos los llamantes
   * concurrentes (un solo fetch para N peticiones) y, una vez resuelta, sirve
   * de caché durante el TTL. Los fallos jamás se guardan.
   */
  promesa: Promise<unknown>;
  /** `Date.now()` en el que deja de valer; `Infinity` mientras está en vuelo. */
  expira: number;
}

/** Caché en memoria de los GET (clave en `claveGet`). */
const entradasGet = new Map<string, EntradaGet>();

/**
 * La clave lleva el `Authorization` porque el token puede cambiar (refresh de
 * sesión): así una respuesta pedida con un token viejo jamás se sirve a uno
 * nuevo.
 */
function claveGet(ruta: string, token: string | null): string {
  return `${token ?? ''}\u0000${ruta}`;
}

/** Las entradas caducadas se barren al insertar; las en vuelo no caducan. */
function barrerEntradasGet(): void {
  const ahora = Date.now();
  for (const [clave, entrada] of entradasGet) {
    if (entrada.expira <= ahora) entradasGet.delete(clave);
  }
}

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

async function tokenDeSupabase(): Promise<string | null> {
  if (!supabase) return null;
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token ?? null;
    if (token) tokenEnMemoria.fijar(token);
    return token;
  } catch {
    return null;
  }
}

/**
 * Token para `Authorization: Bearer`, en este orden:
 *  1. el que hay en memoria (viene de la cookie httpOnly vía
 *     `GET /api/auth/session`, o de una sesión legada de supabase-js);
 *  2. si no, `GET /api/auth/session` —que además renueva el access token con
 *     `mv_rt` si caducó—. Solo en rutas privadas: las públicas no necesitan
 *     sesión y no hay que martillear el endpoint en cada carga;
 *  3. por último la sesión guardada en localStorage por supabase-js.
 */
async function obtenerToken(esPublica: boolean): Promise<string | null> {
  const enMemoria = tokenEnMemoria.vigente();
  if (enMemoria) return enMemoria;
  if (!esPublica) {
    const sesion = await consultarSesionCookie();
    if (sesion) return tokenEnMemoria.vigente() ?? sesion.access_token;
  }
  return tokenDeSupabase();
}

/**
 * Llamada a la API: timeout de 15 s y errores i18n mapeados por status.
 *
 * Los GET se deduplican y se cachean en memoria 5 s por clave `ruta +
 * Authorization` (ver `claveGet`): dos llamadas concurrentes comparten un solo
 * fetch y, dentro del TTL, la respuesta ya resuelta. Cualquier mutación con
 * éxito (POST/PATCH/PUT/DELETE) vacía la caché entera. Un GET con `signal` del
 * llamante no participa en la caché: va directo a `fetch` con su propio aborto.
 */
export async function api<T>(
  ruta: string,
  opciones: RequestInit & { json?: unknown } = {},
): Promise<T> {
  const rutasPublicas = [
    '/estaciones',
    '/incidencias',
    '/suprimidos',
    '/trenes/horarios',
    '/trenes/estacion',
    '/trenes/disponibilidad',
    '/trenes/posiciones',
    '/health',
  ];
  const esPublica = rutasPublicas.some((r) => ruta.startsWith(r));
  const token = await obtenerToken(esPublica);
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

  const ejecutar = async (): Promise<T> => {
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
        throw new Error(i18n.t('errores.timeout'), { cause: e });
      }
      throw e;
    } finally {
      limpiar();
    }
  };

  const metodo = (opciones.method ?? 'GET').toUpperCase();

  if (metodo !== 'GET') {
    // Una mutación con éxito deja la caché de GET obsoleta: se vacía entera
    // (un fallo, en cambio, no la toca).
    const datos = await ejecutar();
    entradasGet.clear();
    return datos;
  }

  // Con señal del llamante no se comparte nada: su aborto debe matar SU
  // fetch, no la promesa que estén usando el resto de llamantes. Además no
  // se lee ni se escribe la caché, para no envenenarla con su cancelación.
  if (opciones.signal) return ejecutar();

  const clave = claveGet(ruta, token);
  const cacheada = entradasGet.get(clave);
  if (cacheada) {
    if (cacheada.expira > Date.now()) return cacheada.promesa as Promise<T>;
    entradasGet.delete(clave);
  }

  barrerEntradasGet();
  let entrada!: EntradaGet;
  // La promesa se comparte y se publica en el Map de forma síncrona: todo
  // GET concurrente con la misma clave y token que llegue después la reutiliza
  // en vez de volver a fetchar.
  const compartida = ejecutar().then(
    (datos) => {
      entrada.expira = Date.now() + TTL_GET_MS;
      return datos;
    },
    (error) => {
      // Los errores (status, timeout, red) no se cachean: se reintenta
      if (entradasGet.get(clave) === entrada) entradasGet.delete(clave);
      throw error;
    },
  );
  entrada = { promesa: compartida, expira: Number.POSITIVE_INFINITY };
  entradasGet.set(clave, entrada);
  return compartida;
}
