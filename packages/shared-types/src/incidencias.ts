/**
 * Cruce entre incidencias de servicio (GTFS-RT alerts) y las alertas de usuario.
 *
 * La web lo usa para resaltar en la ficha de la alerta las incidencias que la
 * afectan; el worker lo usa para decidir a quién enviar el push. Fuente única
 * de la lógica de match: sin tildes, sin puntuación y sin artículo inicial.
 */

/** Campos de una incidencia necesarios para cruzarla con una ruta. */
export interface IncidenciaComparable {
  titulo?: string | null;
  mensaje?: string | null;
  estacionesAfectadas: readonly string[];
}

/** Sin tildes, minúsculas y con espacios colapsados (mismo criterio que la BD). */
export function normalizarTexto(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();
}

/**
 * Clave de comparación de estaciones: como `claveBusqueda` de la BD, sin
 * tildes, sin guiones (puntuación = espacio) y sin artículo inicial, para que
 * "A Coruña", "La Coruña" y "Coruña" o "Madrid-Chamartín" y "Madrid Chamartín"
 * comparen igual.
 */
function claveTexto(texto: string): string {
  return normalizarTexto(texto)
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^(la|el|los|las|os|as|una|un|a|o) /, '');
}

function escapar(texto: string): string {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** ¿Aparece `clave` como palabra suelta en `texto`? Ambos ya con claveTexto. */
function contienePalabra(texto: string, clave: string): boolean {
  if (!texto || !clave) return false;
  return new RegExp(`(?:^|[^a-z0-9])${escapar(clave)}(?:[^a-z0-9]|$)`).test(texto);
}

/**
 * ¿Una incidencia afecta a alguna de las estaciones dadas (nombre del origen o
 * del destino de la alerta)? Compara nombres normalizados contra las estaciones
 * afectadas y contra el texto del aviso. Si el nombre tiene varias palabras,
 * también vale con que aparezcan todas (tolera "Madrid Atocha" frente a
 * "Madrid-Puerto de Atocha").
 */
export function incidenciaAfectaA(
  incidencia: IncidenciaComparable,
  estaciones: Array<string | null | undefined>,
): boolean {
  const mensaje = claveTexto(incidencia.mensaje ?? '');
  const titulo = claveTexto(incidencia.titulo ?? '');
  const afectadas = incidencia.estacionesAfectadas.map(claveTexto);

  return estaciones.some((nombre) => {
    const clave = claveTexto(nombre ?? '');
    if (clave.length < 3) return false;
    const palabras = clave.split(' ').filter((palabra) => palabra.length >= 4);
    const coincideEn = (texto: string) =>
      contienePalabra(texto, clave) ||
      contienePalabra(clave, texto) ||
      (palabras.length > 1 && palabras.every((palabra) => contienePalabra(texto, palabra)));

    return afectadas.some(coincideEn) || coincideEn(mensaje) || coincideEn(titulo);
  });
}
