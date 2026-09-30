import type { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { cambiarIdioma, esRutaTrayecto, rutaEnIdioma, type Idioma } from '@/i18n';

type ClaveNav = 'pie.navTrayectos' | 'pie.navHorarios' | 'pie.navMapa' | 'pie.navEstaciones';

/** Solo `/trayectos` tiene versión bilingüe por URL; el resto es la misma ruta. */
const NAV: Array<{ to: string; en?: string; clave: ClaveNav }> = [
  { to: '/trayectos', en: '/en/trayectos', clave: 'pie.navTrayectos' },
  { to: '/trenes', clave: 'pie.navHorarios' },
  { to: '/mapa', clave: 'pie.navMapa' },
  { to: '/estaciones', clave: 'pie.navEstaciones' },
];

/**
 * Conmutador discreto EN|ES. Solo aparece en rutas de trayecto (únicas con
 * versión en el otro idioma), lleva a la misma ruta en el idioma elegido y
 * cambia el idioma global (el mismo que usa el selector del Header).
 */
function ConmutadorIdioma({ lang }: { lang: Idioma }) {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  if (!esRutaTrayecto(pathname)) return null;

  const rutaEs = rutaEnIdioma(pathname, 'es');
  const rutaEn = rutaEnIdioma(pathname, 'en');
  const clase = (activo: boolean) =>
    activo ? 'text-foreground' : 'hover:text-foreground transition-colors';

  return (
    <nav
      aria-label={t('pie.ariaIdioma', { lng: lang })}
      className="flex items-center gap-1 text-xs font-semibold tracking-wide"
    >
      <Link
        to={rutaEs}
        lang="es"
        hrefLang="es"
        aria-current={lang === 'es' ? 'page' : undefined}
        className={clase(lang === 'es')}
        onClick={() => cambiarIdioma('es')}
      >
        ES
      </Link>
      <span aria-hidden="true" className="text-muted-foreground/60">
        |
      </span>
      <Link
        to={rutaEn}
        lang="en"
        hrefLang="en"
        aria-current={lang === 'en' ? 'page' : undefined}
        className={clase(lang === 'en')}
        onClick={() => cambiarIdioma('en')}
      >
        EN
      </Link>
    </nav>
  );
}

/** Cabecera y pie de las páginas públicas de SEO (fuera del panel con sesión). */
export function SeoShell({ children, lang = 'es' }: { children: ReactNode; lang?: Idioma }) {
  const { t } = useTranslation();
  const nav = NAV.map((enlace) => ({
    ...enlace,
    href: lang === 'en' && enlace.en ? enlace.en : enlace.to,
    texto: t(enlace.clave, { lng: lang }),
  }));
  const pieAfiliacion = t('pie.afiliacion', { lng: lang });
  const pieDatos = t('pie.datos', { lng: lang });

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-40 border-b bg-background/90 backdrop-blur">
        <div className="container flex h-16 items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <span className="font-heading text-lg font-bold">M</span>
            </div>
            <span className="font-heading text-xl font-semibold tracking-tight">
              Manti<span className="text-primary">Renfe</span>
            </span>
          </Link>
          <nav className="hidden items-center gap-6 text-sm font-medium text-muted-foreground md:flex">
            {nav.map((enlace) => (
              <Link key={enlace.clave} to={enlace.href} className="hover:text-foreground">
                {enlace.texto}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-3">
            <ConmutadorIdioma lang={lang} />
            <Button asChild>
              <Link to="/alertas/nueva">{t('pie.cta', { lng: lang })}</Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1 py-10">{children}</main>

      <footer className="border-t bg-muted/30 py-10">
        <div className="container space-y-3 text-center text-sm text-muted-foreground">
          <p className="flex flex-wrap justify-center gap-x-4">
            {nav.map((enlace) => (
              <Link key={enlace.clave} to={enlace.href} className="hover:text-foreground">
                {enlace.texto}
              </Link>
            ))}
          </p>
          <p>
            <strong>MantiRenfe</strong>
            {pieAfiliacion}
          </p>
          <p>{pieDatos}</p>
        </div>
      </footer>
    </div>
  );
}
