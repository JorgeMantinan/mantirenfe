import type { EstacionResponse } from '@mantirenfe/shared-types';
import { i18n, type Idioma } from '@/i18n';

const RE_ARTICULO_INICIAL = /^(la|el|los|las|os|as|una|un|a|o) /;
const RE_PALABRA = /[\p{L}\p{N}]+/gu;

/**
 * Normalización compartida con `packages/database`: sin tildes, minúsculas.
 * Mantiene los guiones, que después se tratan como separadores.
 */
export function normalizarTexto(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();
}

/**
 * Clave de comparación de estaciones (misma que `claveBusqueda` de
 * `packages/database`): sin tildes, guiones convertidos a espacio y sin
 * artículo inicial. Así "A Coruña" y "La Corunya" comparan "coruna"/"corunya".
 */
export function claveBusqueda(texto: string): string {
  return normalizarTexto(texto)
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(RE_ARTICULO_INICIAL, '');
}

/** "a-coruna" -> "A Coruna" (el emparejamiento con la BD tolera tildes). */
export function slugATexto(slug: string): string {
  return slug
    .split('-')
    .filter(Boolean)
    .map((palabra) => palabra.charAt(0).toUpperCase() + palabra.slice(1))
    .join(' ');
}

/** "València-Joaquín Sorolla" -> "valencia-joaquin-sorolla". */
export function textoASlug(texto: string): string {
  return normalizarTexto(texto)
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > 3) return 99;
  let anterior = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const actual = [i];
    let minimo = i;
    for (let j = 1; j <= b.length; j++) {
      const valor = Math.min(
        anterior[j]! + 1,
        actual[j - 1]! + 1,
        anterior[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      actual.push(valor);
      if (valor < minimo) minimo = valor;
    }
    if (minimo > 3) return 99;
    anterior = actual;
  }
  return anterior[b.length]!;
}

/** Recupera tildes y «ñ» del texto del slug usando las estaciones encontradas. */
function restaurarPalabras(texto: string, candidatos: EstacionResponse[]): string {
  const originales = new Map<string, string>();
  for (const candidato of candidatos) {
    const fragmentos = `${candidato.nombre} ${candidato.ciudad ?? ''}`;
    for (const coincidencia of fragmentos.matchAll(RE_PALABRA)) {
      const palabra = coincidencia[0];
      const clave = normalizarTexto(palabra);
      if (clave && !originales.has(clave)) originales.set(clave, palabra);
    }
  }
  return texto
    .split(' ')
    .map((palabra) => originales.get(normalizarTexto(palabra)) ?? palabra)
    .join(' ');
}

/**
 * Convierte el slug de la URL en el nombre visible del trayecto, verificando
 * contra las estaciones que devuelve `GET /estaciones?q=`. Devuelve `null` si
 * ninguna estación coincide (estado «no encontramos esa estación»).
 *
 * Prioridad: estación exacta > nombre exacto sin tildes > errata o artículo
 * ("la-corunya" -> "A Coruña") > estación con todas las palabras del slug >
 * palabras del slug restauradas con las tildes reales ("malaga" -> "Málaga").
 */
export function resolverSlug(slug: string, candidatos: EstacionResponse[]): string | null {
  const texto = slugATexto(slug);
  const clave = claveBusqueda(texto);
  if (!clave || candidatos.length === 0) return null;
  const umbral = clave.length >= 7 ? 2 : 1;

  const coincide = (candidato: EstacionResponse): boolean => {
    const nombre = claveBusqueda(candidato.nombre);
    const ciudad = candidato.ciudad ? claveBusqueda(candidato.ciudad) : '';
    if (nombre === clave || (ciudad && ciudad === clave)) return true;
    if (nombre.includes(clave) || (ciudad && ciudad.includes(clave))) return true;
    return (
      levenshtein(nombre, clave) <= umbral || (!!ciudad && levenshtein(ciudad, clave) <= umbral)
    );
  };
  if (!candidatos.some(coincide)) return null;

  const exacta = candidatos.find(
    (c) => claveBusqueda(c.nombre) === clave || textoASlug(c.nombre) === textoASlug(slug),
  );
  if (exacta) return exacta.nombre;

  const cercana = candidatos.find((c) => {
    const nombre = claveBusqueda(c.nombre);
    return nombre.split(' ').length <= 3 && levenshtein(nombre, clave) <= umbral;
  });
  if (cercana) return cercana.nombre;

  if (slug.split('-').filter(Boolean).length > 1) {
    const prefijo = candidatos.find((c) => claveBusqueda(c.nombre).startsWith(clave));
    if (prefijo) return prefijo.nombre;
  }

  return restaurarPalabras(texto, candidatos);
}

export interface TrayectoPopular {
  origenSlug: string;
  destinoSlug: string;
  origenNombre: string;
  destinoNombre: string;
}

/** Rutas semilla del sitemap y de los enlaces internos. Mantener en sintonía con `public/sitemap.xml`. */
export const TRAYECTOS_POPULARES: TrayectoPopular[] = [
  {
    origenSlug: 'madrid',
    destinoSlug: 'barcelona',
    origenNombre: 'Madrid',
    destinoNombre: 'Barcelona',
  },
  {
    origenSlug: 'madrid',
    destinoSlug: 'sevilla',
    origenNombre: 'Madrid',
    destinoNombre: 'Sevilla',
  },
  {
    origenSlug: 'madrid',
    destinoSlug: 'valencia',
    origenNombre: 'Madrid',
    destinoNombre: 'Valencia',
  },
  { origenSlug: 'madrid', destinoSlug: 'malaga', origenNombre: 'Madrid', destinoNombre: 'Málaga' },
  { origenSlug: 'madrid', destinoSlug: 'bilbao', origenNombre: 'Madrid', destinoNombre: 'Bilbao' },
  {
    origenSlug: 'barcelona',
    destinoSlug: 'valencia',
    origenNombre: 'Barcelona',
    destinoNombre: 'Valencia',
  },
  {
    origenSlug: 'a-coruna',
    destinoSlug: 'madrid',
    origenNombre: 'A Coruña',
    destinoNombre: 'Madrid',
  },
  { origenSlug: 'vigo', destinoSlug: 'madrid', origenNombre: 'Vigo', destinoNombre: 'Madrid' },
  {
    origenSlug: 'sevilla',
    destinoSlug: 'malaga',
    origenNombre: 'Sevilla',
    destinoNombre: 'Málaga',
  },
  {
    origenSlug: 'valencia',
    destinoSlug: 'barcelona',
    origenNombre: 'Valencia',
    destinoNombre: 'Barcelona',
  },
  {
    origenSlug: 'madrid',
    destinoSlug: 'zaragoza',
    origenNombre: 'Madrid',
    destinoNombre: 'Zaragoza',
  },
  {
    origenSlug: 'granada',
    destinoSlug: 'madrid',
    origenNombre: 'Granada',
    destinoNombre: 'Madrid',
  },
  { origenSlug: 'murcia', destinoSlug: 'madrid', origenNombre: 'Murcia', destinoNombre: 'Madrid' },
  {
    origenSlug: 'valladolid',
    destinoSlug: 'madrid',
    origenNombre: 'Valladolid',
    destinoNombre: 'Madrid',
  },
  {
    origenSlug: 'salamanca',
    destinoSlug: 'madrid',
    origenNombre: 'Salamanca',
    destinoNombre: 'Madrid',
  },
];

export function rutaTrayecto(trayecto: TrayectoPopular, lang: Idioma = 'es'): string {
  const base = lang === 'en' ? '/en/trayectos' : '/trayectos';
  return `${base}/${trayecto.origenSlug}/${trayecto.destinoSlug}`;
}

export function etiquetaTrayecto(trayecto: TrayectoPopular, lang: Idioma = 'es'): string {
  return i18n.t('trayectos.etiqueta', {
    lng: lang,
    origen: trayecto.origenNombre,
    destino: trayecto.destinoNombre,
  });
}

export function fechaHoy(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Fecha larga en es-ES (por defecto) o en en-GB para la versión inglesa. */
export function fechaLarga(fecha: string, lang: Idioma = 'es'): string {
  return new Date(`${fecha}T12:00:00Z`).toLocaleDateString(lang === 'en' ? 'en-GB' : 'es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}
