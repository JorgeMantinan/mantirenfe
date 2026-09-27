import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';

const NAV = [
  { to: '/trayectos', texto: 'Trayectos' },
  { to: '/trenes', texto: 'Buscar horarios' },
  { to: '/mapa', texto: 'Mapa' },
  { to: '/estaciones', texto: 'Estaciones' },
];

/** Cabecera y pie de las páginas públicas de SEO (fuera del panel con sesión). */
export function SeoShell({ children }: { children: ReactNode }) {
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
            {NAV.map((enlace) => (
              <Link key={enlace.to} to={enlace.to} className="hover:text-foreground">
                {enlace.texto}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <Button asChild>
              <Link to="/alertas/nueva">Crear alerta</Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1 py-10">{children}</main>

      <footer className="border-t bg-muted/30 py-10">
        <div className="container space-y-3 text-center text-sm text-muted-foreground">
          <p className="flex flex-wrap justify-center gap-x-4">
            {NAV.map((enlace) => (
              <Link key={enlace.to} to={enlace.to} className="hover:text-foreground">
                {enlace.texto}
              </Link>
            ))}
          </p>
          <p>
            <strong>MantiRenfe</strong> es un proyecto independiente y no está afiliado, patrocinado
            ni respaldado por Renfe Operadora, Adif ni ningún operador ferroviario.
          </p>
          <p>Origen de los datos: Renfe Operadora (open data, CC-BY 4.0) · © 2026 MantiRenfe</p>
        </div>
      </footer>
    </div>
  );
}
