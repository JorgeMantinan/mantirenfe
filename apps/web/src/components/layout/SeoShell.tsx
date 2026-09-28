import type { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { esRutaTrayecto, rutaEnIdioma, type Idioma } from '@/lib/trayectos-i18n';

const NAV: Record<Idioma, { to: string; texto: string }[]> = {
  es: [
    { to: '/trayectos', texto: 'Trayectos' },
    { to: '/trenes', texto: 'Buscar horarios' },
    { to: '/mapa', texto: 'Mapa' },
    { to: '/estaciones', texto: 'Estaciones' },
  ],
  en: [
    { to: '/en/trayectos', texto: 'Routes' },
    { to: '/trenes', texto: 'Search timetables' },
    { to: '/mapa', texto: 'Map' },
    { to: '/estaciones', texto: 'Stations' },
  ],
};

const CTA: Record<Idioma, string> = { es: 'Crear alerta', en: 'Create alert' };

/** Texto tras el «MantiRenfe» en negrita del pie. */
const PIE: Record<Idioma, { afiliacion: string; datos: string }> = {
  es: {
    afiliacion:
      ' es un proyecto independiente y no está afiliado, patrocinado ni respaldado por Renfe Operadora, Adif ni ningún operador ferroviario.',
    datos: 'Origen de los datos: Renfe Operadora (open data, CC-BY 4.0) · © 2026 MantiRenfe',
  },
  en: {
    afiliacion:
      ' is an independent project, not affiliated with, sponsored or endorsed by Renfe Operadora, Adif or any rail operator.',
    datos: 'Data source: Renfe Operadora (open data, CC-BY 4.0) · © 2026 MantiRenfe',
  },
};

/**
 * Conmutador discreto EN|ES. Solo aparece en rutas de trayecto (únicas con
 * versión en el otro idioma) y lleva a la misma ruta en el idioma elegido.
 */
function ConmutadorIdioma({ lang }: { lang: Idioma }) {
  const { pathname } = useLocation();
  if (!esRutaTrayecto(pathname)) return null;

  const rutaEs = rutaEnIdioma(pathname, 'es');
  const rutaEn = rutaEnIdioma(pathname, 'en');
  const clase = (activo: boolean) =>
    activo ? 'text-foreground' : 'hover:text-foreground transition-colors';

  return (
    <nav
      aria-label={lang === 'en' ? 'Language' : 'Idioma'}
      className="flex items-center gap-1 text-xs font-semibold tracking-wide"
    >
      <Link
        to={rutaEs}
        lang="es"
        hrefLang="es"
        aria-current={lang === 'es' ? 'page' : undefined}
        className={clase(lang === 'es')}
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
      >
        EN
      </Link>
    </nav>
  );
}

/** Cabecera y pie de las páginas públicas de SEO (fuera del panel con sesión). */
export function SeoShell({ children, lang = 'es' }: { children: ReactNode; lang?: Idioma }) {
  const nav = NAV[lang];
  const pie = PIE[lang];

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
              <Link key={enlace.to} to={enlace.to} className="hover:text-foreground">
                {enlace.texto}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-3">
            <ConmutadorIdioma lang={lang} />
            <Button asChild>
              <Link to="/alertas/nueva">{CTA[lang]}</Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1 py-10">{children}</main>

      <footer className="border-t bg-muted/30 py-10">
        <div className="container space-y-3 text-center text-sm text-muted-foreground">
          <p className="flex flex-wrap justify-center gap-x-4">
            {nav.map((enlace) => (
              <Link key={enlace.to} to={enlace.to} className="hover:text-foreground">
                {enlace.texto}
              </Link>
            ))}
          </p>
          <p>
            <strong>MantiRenfe</strong>
            {pie.afiliacion}
          </p>
          <p>{pie.datos}</p>
        </div>
      </footer>
    </div>
  );
}
