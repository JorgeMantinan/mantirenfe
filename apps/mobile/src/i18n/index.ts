import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import { es, type Claves } from './es';
import { en, type MismoArbol } from './en';

/** Idiomas soportados por la app (solo dos, por decisión de producto). */
export type Idioma = 'es' | 'en';

export const IDIOMAS: readonly Idioma[] = ['es', 'en'];

/** Clave de `localStorage` donde se guarda la última elección del usuario. */
export const CLAVE_IDIOMA = 'mantirenfe:idioma';

/** Recursos estáticos: no hay backend ni carga diferida. */
type Recursos = { translation: MismoArbol<Claves> };

/**
 * `localStorage` lo instala `expo-sqlite` (mismo acceso que `tema-contexto`):
 * el importador de este módulo (`_layout.tsx`) carga antes `@/lib/supabase`
 * para que la elección guardada ya se pueda leer. Fuera de React Native
 * (tests) no existe y seguimos con el idioma por defecto.
 */
function leerIdiomaGuardado(): Idioma | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const valor = localStorage.getItem(CLAVE_IDIOMA);
    return valor === 'es' || valor === 'en' ? valor : null;
  } catch {
    return null;
  }
}

function guardarIdioma(idioma: Idioma): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(CLAVE_IDIOMA, idioma);
  } catch {
    // sin persistencia no debe romper el cambio de idioma
  }
}

/** Idioma inicial: la última elección guardada → idioma del sistema → español. */
export function idiomaInicial(): Idioma {
  const guardado = leerIdiomaGuardado();
  if (guardado) return guardado;
  try {
    const delSistema = Intl.DateTimeFormat().resolvedOptions().locale ?? '';
    if (delSistema.toLowerCase().startsWith('en')) return 'en';
  } catch {
    // Intl no disponible en este runtime: español por defecto
  }
  return 'es';
}

/** Cambia el idioma global y lo persiste para los próximos arranques. */
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

/** Traductor de la app (instancia global: también usable fuera de React). */
export const t = i18next.t.bind(i18next) as typeof i18next.t;

/** Instancia i18next de la app (también usable fuera de React). */
export const i18n = i18next;
