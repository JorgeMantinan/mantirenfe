import type { Estacion, PrismaClient } from '@prisma/client';

export function normalizarTexto(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();
}

/**
 * Filtra y ordena estaciones por coincidencia ignorando mayúsculas y tildes.
 * Prioridad: igualdad exacta > empieza por > contiene (nombre o ciudad).
 */
export function filtrarEstaciones<T extends { nombre: string; ciudad?: string | null }>(
  estaciones: T[],
  texto: string,
  limite = 10,
): T[] {
  const consulta = normalizarTexto(texto);
  if (!consulta) return [];

  const conPrioridad: Array<{ estacion: T; prioridad: number }> = [];
  for (const estacion of estaciones) {
    const nombre = normalizarTexto(estacion.nombre);
    const ciudad = estacion.ciudad ? normalizarTexto(estacion.ciudad) : '';
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
  if (!normalizarTexto(texto)) return [];
  if (!cache || cache.caduca <= Date.now()) {
    const estaciones = await prisma.estacion.findMany({ orderBy: { nombre: 'asc' } });
    cache = { estaciones, caduca: Date.now() + TTL_MS };
  }
  return filtrarEstaciones(cache.estaciones, texto, limite);
}

export function invalidarCacheEstaciones(): void {
  cache = null;
}
