export interface IncidenciaResponse {
  id: string;
  titulo: string | null;
  mensaje: string | null;
  causa: string | null;
  estacionesAfectadas: string[];
  desde: string | null;
  hasta: string | null;
  activa: boolean;
  actualizadaEn: string;
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
  incidencia: IncidenciaResponse,
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

function formatoFecha(valor: string): string {
  return new Date(valor).toLocaleString('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatoPeriodo(desde: string | null, hasta: string | null): string {
  if (desde && hasta) return `${formatoFecha(desde)} – ${formatoFecha(hasta)}`;
  if (desde) return `Desde el ${formatoFecha(desde)}`;
  if (hasta) return `Hasta el ${formatoFecha(hasta)}`;
  return 'Periodo no indicado';
}
