import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import { es, type Claves } from './es';
import { en, type MismoArbol } from './en';

/** Idiomas soportados por la web (solo dos, por decisión de producto). */
export type Idioma = 'es' | 'en';

export const IDIOMAS: readonly Idioma[] = ['es', 'en'];

/** Clave de `localStorage` donde se guarda la última elección del usuario. */
export const CLAVE_IDIOMA = 'idioma';

/** Recursos estáticos: no hay backend ni carga diferida. */
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

/** Cambia el idioma global y lo persiste para las próximas visitas. */
export function cambiarIdioma(idioma: Idioma): Promise<void> {
  guardarIdioma(idioma);
  return i18next.changeLanguage(idioma).then(() => undefined);
}

/** Locale compartido para fechas y números según el idioma activo. */
export function locale(): string {
  return i18next.language === 'en' ? 'en-GB' : 'es-ES';
}

const recursos: Record<Idioma, Recursos> = {
  es: { translation: es },
  en: { translation: en },
};

void i18next.use(initReactI18next).init({
  lng: idiomaInicial(),
  fallbackLng: 'es',
  supportedLngs: ['es', 'en'],
  resources: recursos,
  interpolation: { escapeValue: false },
  returnNull: false,
  react: { useSuspense: false },
});

/** Instancia i18next de la app (también usable fuera de React). */
export const i18n = i18next;
