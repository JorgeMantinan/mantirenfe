import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import { es, type Claves } from './es';
import type { MismoArbol } from './en';

/** Idiomas soportados por la web (solo dos, por decisión de producto). */
export type Idioma = 'es' | 'en';

export const IDIOMAS: readonly Idioma[] = ['es', 'en'];

/** Clave de `localStorage` donde se guarda la última elección del usuario. */
export const CLAVE_IDIOMA = 'idioma';

/** Recursos de un idioma: su árbol de claves bajo el namespace `translation`. */
type Recursos = { translation: MismoArbol<Claves> };

function leerIdiomaGuardado(): Idioma | null {
  if (typeof window === 'undefined') return null;
  try {
    const valor = window.localStorage.getItem(CLAVE_IDIOMA);
    return valor === 'es' || valor === 'en' ? valor : null;
  } catch {
    // localStorage bloqueado (modo privado): seguimos con la detección
    return null;
  }
}

function guardarIdioma(idioma: Idioma): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(CLAVE_IDIOMA, idioma);
  } catch {
    // sin persistencia no debe romper el cambio de idioma
  }
}

/** ¿Es una ruta de trayecto (en español o en inglés)? */
export function esRutaTrayecto(pathname: string): boolean {
  const ruta = pathname.replace(/^\/en(?=\/|$)/, '');
  return ruta === '/trayectos' || ruta.startsWith('/trayectos/');
}

/** Misma ruta en el idioma pedido: "/trayectos/a/b" <-> "/en/trayectos/a/b". */
export function rutaEnIdioma(pathname: string, lang: Idioma): string {
  const sinPrefijo = pathname.replace(/^\/en(?=\/|$)/, '') || '/';
  if (lang === 'es') return sinPrefijo;
  return sinPrefijo === '/' ? '/en' : `/en${sinPrefijo}`;
}

/**
 * Idioma inicial: el prefijo `/en/` de la URL manda (SEO); después, la última
 * elección guardada en `localStorage['idioma']`; y, en una visita nueva, el
 * `navigator.language` (solo si empieza por "en").
 */
export function idiomaInicial(): Idioma {
  if (typeof window === 'undefined') return 'es';

  const ruta = window.location.pathname;
  if (esRutaTrayecto(ruta)) return ruta.startsWith('/en') ? 'en' : 'es';

  const guardado = leerIdiomaGuardado();
  if (guardado) return guardado;

  const navegador = (globalThis.navigator?.language ?? '').toLowerCase();
  return navegador.startsWith('en') ? 'en' : 'es';
}

/**
 * Carga bajo demanda de cada diccionario. No hay cargador de `es`: es el
 * idioma por defecto, estático en el bundle raíz, así que sus recursos ya
 * están en `recursos` antes de `init`. Solo `en` usa `import()` dinámico, de
 * forma que vive en un chunk aparte que solo se descarga quien lo necesita.
 */
const cargadores: Partial<Record<Idioma, () => Promise<Recursos>>> = {
  en: () => import('./en').then((modulo) => ({ translation: modulo.en })),
};

const recursos: Partial<Record<Idioma, Recursos>> & { es: Recursos } = {
  es: { translation: es },
};

const cargados = new Set<Idioma>(['es']);

/**
 * Descarga (si aún no lo está) el diccionario de `idioma` y lo registra en la
 * instancia i18next. Idempotente: la segunda llamada devuelve ya la promesa
 * resuelta. Si el `import()` falla, el idioma NO se marca como cargado, de
 * modo que la próxima llamada reintenta; mientras tanto, `fallbackLng: 'es'`
 * evita enseñar claves crudas.
 */
async function cargarIdioma(idioma: Idioma): Promise<void> {
  const importar = cargadores[idioma];
  if (!importar || cargados.has(idioma)) return;
  const arbol = await importar();
  cargados.add(idioma);
  recursos[idioma] = arbol;
  // i18next ya está vivo: inyectamos el árbol directamente en su store
  if (i18next.isInitialized) {
    i18next.addResourceBundle(idioma, 'translation', arbol.translation, true, true);
  }
}

async function inicializar(idioma: Idioma): Promise<void> {
  try {
    // Con `resources` en opciones, i18next termina de forma síncrona: al
    // salir de esta llamada `i18n.t` ya resuelve. Solo se espera su promesa
    // para que `i18nListo` sea una promesa honesta.
    await i18next.use(initReactI18next).init({
      lng: idioma,
      fallbackLng: 'es',
      supportedLngs: ['es', 'en'],
      resources: recursos,
      interpolation: { escapeValue: false },
      returnNull: false,
      react: { useSuspense: false },
    });
  } catch {
    // Un init fallido no debe impedir montar la app: `fallbackLng` cubre el resto
  }
}

const inicial = idiomaInicial();

/**
 * Resuelve cuando i18next está inicializado. Arrancando en ES (lo normal) el
 * `init` sigue siendo síncrono, como siempre. Arrancando en EN —misma
 * condición que `idiomaInicial`: URL `/en/`, elección guardada o
 * `navigator.language`— primero se descarga su diccionario y solo después se
 * inicializa, para que la primera pintura no muestre claves crudas.
 * `main.tsx` espera a esta promesa antes de montar React.
 */
let listo: Promise<void>;
if (inicial === 'es') {
  listo = inicializar('es');
} else {
  listo = cargarIdioma(inicial)
    .catch(() => undefined) // sin el chunk EN, init igualmente: fallback a ES
    .then(() => inicializar(inicial));
}
export const i18nListo: Promise<void> = listo;

/** Cambia el idioma global y lo persiste para las próximas visitas. */
export async function cambiarIdioma(idioma: Idioma): Promise<void> {
  guardarIdioma(idioma);
  await i18nListo;
  await cargarIdioma(idioma).catch(() => undefined);
  await i18next.changeLanguage(idioma);
}

/** Locale compartido para fechas y números según el idioma activo. */
export function locale(): string {
  return i18next.language === 'en' ? 'en-GB' : 'es-ES';
}

/** Instancia i18next de la app (también usable fuera de React). */
export const i18n = i18next;
