import { useEffect, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { I18nextProvider, useTranslation } from 'react-i18next';
import { cambiarIdioma, esRutaTrayecto, i18n, type Idioma } from './index';

/**
 * Las rutas de trayecto con prefijo `/en/` (las únicas bilingües por URL)
 * fijan el idioma global al entrar; las rutas `/trayectos` vuelven a español.
 * El conmutador de `SeoShell` sigue enlazando las rutas alternas con
 * hreflang, de modo que este efecto mantiene el idioma y la URL en sincronía.
 */
function SincronizaIdiomaConRuta() {
  const { pathname } = useLocation();

  useEffect(() => {
    if (!esRutaTrayecto(pathname)) return;
    const lang: Idioma = pathname.startsWith('/en') ? 'en' : 'es';
    if (i18n.language !== lang) void cambiarIdioma(lang);
  }, [pathname]);

  return null;
}

/**
 * `document.documentElement.lang` y el título por defecto siguen al idioma
 * activo. Las páginas SEO de trayecto se encargan de sus propios tags (y este
 * efecto no las toca), así que solo aplica la base en el resto de rutas.
 */
function MetaIdioma() {
  const { pathname } = useLocation();
  const { i18n: instancia } = useTranslation();
  const language = instancia.language;

  useEffect(() => {
    const lang: Idioma = language.startsWith('en') ? 'en' : 'es';
    document.documentElement.lang = lang;
    if (esRutaTrayecto(pathname)) return;
    document.title = instancia.t('meta.baseTitulo', { lng: lang });
    const descripcion = document.head.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (descripcion)
      descripcion.setAttribute('content', instancia.t('meta.baseDescripcion', { lng: lang }));
  }, [pathname, language, instancia]);

  return null;
}

export function IdiomaProvider({ children }: { children: ReactNode }) {
  return (
    <I18nextProvider i18n={i18n}>
      <SincronizaIdiomaConRuta />
      <MetaIdioma />
      {children}
    </I18nextProvider>
  );
}
