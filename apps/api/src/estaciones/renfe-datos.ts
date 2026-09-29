import { claveBusqueda, filtrarEstaciones } from '@mantirenfe/database';
import type { AforoHistoricoResponse } from '@mantirenfe/shared-types';

/**
 * Consulta puntual al CKAN de data.renfe.com (action datastore_search) para
 * enriquecer la ficha de una estación sin descargar el CSV entero:
 *
 * - Listado oficial de estaciones (CODIGO/DESCRIPCION/LATITUD/LONGITUD/...).
 * - Volumen de viajeros por franja horaria de 2018, agregado de todos los
 *   núcleos de cercanías en un único recurso (23.492 filas).
 *
 * Ambos recursos son estáticos: se cachean en memoria con TTL largo. Cualquier
 * fallo del CKAN se traduce en `null` (nunca propaga la excepción) para que el
 * endpoint siga devolviendo la ficha que tengamos.
 */
export const RECURSO_LISTADO_ESTACIONES = '783e0626-6fa8-4ac7-a880-fa53144654ff';
export const RECURSO_AFOROS = '566dcfa2-4c02-48bf-99c9-a7606a097073';
export const ANIO_AFOROS = 2018;

const URL_CKAN = 'https://data.renfe.com/api/3/action/datastore_search';
const TTL_MS = 6 * 60 * 60 * 1000;
/** Si el CKAN está caído no castigamos: reintentamos en unos minutos. */
const TTL_ERROR_MS = 5 * 60 * 1000;
const TIMEOUT_MS = 6_000;
const LIMITE_FILAS = 200;

type Fila = Record<string, unknown>;

export interface FichaOficial {
  latitud: number | null;
  longitud: number | null;
  direccion: string | null;
  cp: string | null;
  poblacion: string | null;
  provincia: string | null;
}

interface EntradaCache<T> {
  valor: T;
  caduca: number;
}

const cacheFichas = new Map<string, EntradaCache<FichaOficial | null>>();
const cacheAforos = new Map<string, EntradaCache<AforoHistoricoResponse[] | null>>();

/**
 * Techo de entradas por caché (LRU sencillo: Map reinserta lo leído al final y
 * lo más antiguo sale primero). Con 1.505 estaciones el límite solo corta si
 * alguien cachea claves arbitrarias; el TTL ya expira lo que no se usa.
 */
const MAX_ENTRADAS_CACHE = 500;

/** Solo para tests: vacía los mapas de caché. */
export function limpiarCacheDatosRenfe(): void {
  cacheFichas.clear();
  cacheAforos.clear();
}

function aNumero(valor: unknown): number | null {
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : null;
  const texto = String(valor ?? '').trim();
  if (!texto) return null;
  const numero = Number(texto);
  return Number.isFinite(numero) ? numero : null;
}

function aTexto(valor: unknown): string | null {
  if (valor === null || valor === undefined) return null;
  const texto = String(valor).trim();
  return texto ? texto : null;
}

/** Los códigos de la BD traen ceros a la izquierda ("04040"); el CKAN no. */
export function codigoNumerico(codigo: string): number | null {
  const texto = codigo.trim();
  if (!/^\d+$/.test(texto)) return null;
  const numero = Number.parseInt(texto, 10);
  return Number.isFinite(numero) ? numero : null;
}

export function parsearFicha(fila: Fila | undefined): FichaOficial | null {
  if (!fila) return null;
  return {
    latitud: aNumero(fila.LATITUD),
    longitud: aNumero(fila.LONGITUD),
    direccion: aTexto(fila.DIRECION),
    cp: aTexto(fila.CP),
    poblacion: aTexto(fila.POBLACION),
    provincia: aTexto(fila.PROVINCIA),
  };
}

/**
 * Convierte las filas del recurso de aforos en franjas ordenadas. La fuente
 * repite alguna franja para el mismo caso (26 estaciones), así que se suman.
 */
export function parsearAforos(filas: Fila[]): AforoHistoricoResponse[] {
  const porFranja = new Map<string, { subidos: number; bajados: number }>();
  for (const fila of filas) {
    const franja = aTexto(fila.TRAMO_HORARIO);
    if (!franja) continue;
    const acumulado = porFranja.get(franja) ?? { subidos: 0, bajados: 0 };
    acumulado.subidos += aNumero(fila.VIAJEROS_SUBIDOS) ?? 0;
    acumulado.bajados += aNumero(fila.VIAJEROS_BAJADOS) ?? 0;
    porFranja.set(franja, acumulado);
  }
  return [...porFranja.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([franja, totales]) => ({
      franja,
      subidos: totales.subidos,
      bajados: totales.bajados,
      anio: ANIO_AFOROS,
    }));
}

async function consultarCkan(
  recurso: string,
  params: Record<string, string>,
): Promise<Fila[] | null> {
  const consulta = new URLSearchParams({
    resource_id: recurso,
    limit: String(LIMITE_FILAS),
    ...params,
  });
  const control = new AbortController();
  const timeout = setTimeout(() => control.abort(), TIMEOUT_MS);
  try {
    const respuesta = await fetch(`${URL_CKAN}?${consulta.toString()}`, {
      signal: control.signal,
      headers: { accept: 'application/json' },
    });
    if (!respuesta.ok) return null;
    const cuerpo = (await respuesta.json()) as {
      success?: boolean;
      result?: { records?: unknown };
    };
    const registros = cuerpo.result?.records;
    if (!cuerpo.success || !Array.isArray(registros)) return null;
    return registros as Fila[];
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Busca en un recurso primero por código (lo habitual) y, si no aparece o el
 * código no es numérico, por nombre con el mismo fuzzy que el buscador.
 */
async function localizar(
  recurso: string,
  codigo: string,
  campoCodigo: string,
  nombre: string,
  campoNombre: string,
): Promise<{ filas: Fila[]; error: boolean }> {
  const numero = codigoNumerico(codigo);
  if (numero !== null) {
    const porCodigo = await consultarCkan(recurso, {
      filters: JSON.stringify({ [campoCodigo]: numero }),
    });
    if (porCodigo === null) return { filas: [], error: true };
    if (porCodigo.length > 0) return { filas: porCodigo, error: false };
  }

  const consulta = claveBusqueda(nombre);
  if (!consulta) return { filas: [], error: false };

  const porNombre = await consultarCkan(recurso, { q: nombre });
  if (porNombre === null) return { filas: [], error: true };

  const candidatas = porNombre
    .map((fila) => ({ fila, nombre: aTexto(fila[campoNombre]) ?? '' }))
    .filter((candidata) => candidata.nombre);
  const mejor = filtrarEstaciones(candidatas, nombre, 1)[0];
  if (!mejor) return { filas: [], error: false };

  const mismaEstacion = candidatas.filter(
    (candidata) => claveBusqueda(candidata.nombre) === claveBusqueda(mejor.nombre),
  );
  return { filas: mismaEstacion.map((candidata) => candidata.fila), error: false };
}

function leer<T>(cache: Map<string, EntradaCache<T>>, clave: string): EntradaCache<T> | undefined {
  const entrada = cache.get(clave);
  if (!entrada) return undefined;
  if (entrada.caduca <= Date.now()) {
    cache.delete(clave);
    return undefined;
  }
  // Reinsertarla la marca como la más reciente (orden LRU del Map)
  cache.delete(clave);
  cache.set(clave, entrada);
  return entrada;
}

function escribir<T>(
  cache: Map<string, EntradaCache<T>>,
  clave: string,
  valor: T,
  esError: boolean,
): T {
  cache.delete(clave);
  cache.set(clave, { valor, caduca: Date.now() + (esError ? TTL_ERROR_MS : TTL_MS) });
  while (cache.size > MAX_ENTRADAS_CACHE) {
    const masAntigua = cache.keys().next().value;
    if (masAntigua === undefined) break;
    cache.delete(masAntigua);
  }
  return valor;
}

/** Datos oficiales de la estación (dirección/CP/población/provincia/coordenadas). */
export async function obtenerFichaOficial(
  codigo: string,
  nombre: string,
): Promise<FichaOficial | null> {
  const clave = codigo.trim().toLowerCase();
  const cacheada = leer(cacheFichas, clave);
  if (cacheada) return cacheada.valor;

  try {
    const { filas, error } = await localizar(
      RECURSO_LISTADO_ESTACIONES,
      codigo,
      'CODIGO',
      nombre,
      'DESCRIPCION',
    );
    return escribir(cacheFichas, clave, parsearFicha(filas[0]), error);
  } catch {
    return escribir(cacheFichas, clave, null, true);
  }
}

/** Aforos 2018 por franja horaria; `null` si la estación no tiene datos. */
export async function obtenerAforos(
  codigo: string,
  nombre: string,
): Promise<AforoHistoricoResponse[] | null> {
  const clave = codigo.trim().toLowerCase();
  const cacheada = leer(cacheAforos, clave);
  if (cacheada) return cacheada.valor;

  try {
    const { filas, error } = await localizar(
      RECURSO_AFOROS,
      codigo,
      'CODIGO_ESTACION',
      nombre,
      'NOMBRE_ESTACION',
    );
    const aforos = filas.length > 0 ? parsearAforos(filas) : null;
    return escribir(cacheAforos, clave, aforos, error);
  } catch {
    return escribir(cacheAforos, clave, null, true);
  }
}
