import type { Estacion, PrismaClient } from '@prisma/client';

export function normalizarTexto(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();
}

const RE_ARTICULO_INICIAL = /^(la|el|los|las|os|as|una|un|a|o) /;

/**
 * Clave de comparación para búsquedas de estaciones: sin tildes, minúsculas,
 * guiones/puntuación convertidos a espacio, espacios colapsados y sin artículo
 * inicial. Así "La Coruña", "A Coruña" y "Coruña" comparten clave ("coruna"),
 * y "Valencia-Joaquin" coincide con "València Joaquín".
 */
export function claveBusqueda(texto: string): string {
  return normalizarTexto(texto)
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(RE_ARTICULO_INICIAL, '');
}

/** Distancia de Levenshtein con corte temprano: devuelve max+1 si excede `max`. */
function levenshteinLimitada(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let anterior = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const actual = [i];
    let minimoFila = i;
    for (let j = 1; j <= b.length; j++) {
      const valor = Math.min(
        anterior[j]! + 1,
        actual[j - 1]! + 1,
        anterior[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      actual.push(valor);
      if (valor < minimoFila) minimoFila = valor;
    }
    if (minimoFila > max) return max + 1;
    anterior = actual;
  }
  return anterior[b.length]!;
}

/**
 * Filtra y ordena estaciones por coincidencia ignorando mayúsculas, tildes,
 * artículos ("La Coruña" = "A Coruña") y guiones.
 * Prioridad: igualdad exacta > empieza por > contiene (nombre o ciudad) >
 * errata pequeña (Levenshtein ≤1-2, solo si no hay nada mejor).
 */
export function filtrarEstaciones<T extends { nombre: string; ciudad?: string | null }>(
  estaciones: T[],
  texto: string,
  limite = 10,
): T[] {
  const consulta = claveBusqueda(texto);
  if (!consulta) return [];

  const conPrioridad: Array<{ estacion: T; prioridad: number }> = [];
  for (const estacion of estaciones) {
    const nombre = claveBusqueda(estacion.nombre);
    const ciudad = estacion.ciudad ? claveBusqueda(estacion.ciudad) : '';
    const prioridad =
      nombre === consulta
        ? 0
        : nombre.startsWith(consulta)
          ? 1
          : nombre.includes(consulta) || ciudad.includes(consulta)
            ? 2
            : -1;
    if (prioridad >= 0) conPrioridad.push({ estacion, prioridad });
  }

  // Fallback de erratas ("cordobba", "valencja"): solo si no hay ninguna
  // coincidencia, y contra cada palabra del nombre (no el nombre completo)
  if (conPrioridad.length === 0 && consulta.length >= 4) {
    const maxDistancia = consulta.length >= 7 ? 2 : 1;
    for (const estacion of estaciones) {
      const palabras = claveBusqueda(estacion.nombre).split(' ');
      if (estacion.ciudad) palabras.push(...claveBusqueda(estacion.ciudad).split(' '));
      const cerca = palabras.some(
        (palabra) =>
          palabra.length >= 4 &&
          levenshteinLimitada(consulta, palabra, maxDistancia) <= maxDistancia,
      );
      if (cerca) conPrioridad.push({ estacion, prioridad: 3 });
    }
  }

  conPrioridad.sort(
    (a, b) => a.prioridad - b.prioridad || a.estacion.nombre.localeCompare(b.estacion.nombre),
  );
  return conPrioridad.slice(0, limite).map((c) => c.estacion);
}

interface CacheEstaciones {
  estaciones: Estacion[];
  caduca: number;
}

const TTL_MS = 60_000;
let cache: CacheEstaciones | null = null;

/**
 * Busca estaciones en la BD. El listado completo (1.505 filas) se cachea 60 s.
 */
export async function buscarEstaciones(
  prisma: PrismaClient,
  texto: string,
  limite = 10,
): Promise<Estacion[]> {
  if (!claveBusqueda(texto)) return [];
  if (!cache || cache.caduca <= Date.now()) {
    const estaciones = await prisma.estacion.findMany({ orderBy: { nombre: 'asc' } });
    cache = { estaciones, caduca: Date.now() + TTL_MS };
  }
  return filtrarEstaciones(cache.estaciones, texto, limite);
}

export function invalidarCacheEstaciones(): void {
  cache = null;
}
