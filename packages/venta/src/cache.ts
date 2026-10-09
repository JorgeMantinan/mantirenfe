export interface EntradaCache<T> {
  /** Promesa compartida: las llamadas concurrentes se cuelgan de la misma. */
  valor: Promise<T>;
  caduca: number;
}

/**
 * Caché con TTL y single-flight: se guarda la PROMESA, no el valor, de modo que
 * varias llamadas simultáneas de la misma clave comparten un único cálculo (un
 * solo fetch a la venta o al feed GTFS-RT). Si la promesa rechaza se borra la
 * entrada para que el siguiente intento vuelva a consultar: no se cachean
 * errores. Poda entradas caducadas cuando crece demasiado.
 */
export async function conCache<T>(
  cache: Map<string, EntradaCache<T>>,
  clave: string,
  ttlMs: number,
  calcular: () => Promise<T>,
): Promise<T> {
  const ahora = Date.now();
  const entrada = cache.get(clave);
  if (entrada && entrada.caduca > ahora) return entrada.valor;

  const pendiente: EntradaCache<T> = { valor: calcular(), caduca: Date.now() + ttlMs };
  cache.set(clave, pendiente);
  try {
    const valor = await pendiente.valor;
    if (cache.size > 200) {
      for (const [k, v] of cache) {
        if (v.caduca <= ahora) cache.delete(k);
      }
    }
    return valor;
  } catch (error) {
    if (cache.get(clave) === pendiente) cache.delete(clave);
    throw error;
  }
}
