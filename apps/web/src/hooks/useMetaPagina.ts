import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { Idioma } from '@/i18n';
import { metaDeRuta } from '@/lib/metas';
import { aplicarMetaPagina } from '@/lib/seo';

/**
 * Fija título, descripción, canonical, `og:*` y JSON-LD de la página al entrar
 * en la ruta (y al cambiar el idioma activo). El HTML prerenderizado del build
 * lleva ya los mismos tags, así que lo que ve el rastreador y lo que pinta la
 * SPA coinciden.
 *
 * Las páginas de trayecto no lo usan: construyen su meta con
 * `metaTrayectos`/`metaTrayecto`, que llevan el nombre de las estaciones.
 */
export function useMetaPagina(ruta: string): void {
  const { i18n: instancia } = useTranslation();
  const lang: Idioma = instancia.language.startsWith('en') ? 'en' : 'es';

  useEffect(() => {
    const meta = metaDeRuta(ruta, lang);
    return meta ? aplicarMetaPagina(meta) : undefined;
  }, [ruta, lang]);
}
