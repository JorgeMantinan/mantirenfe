import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  Bell,
  BellRing,
  ChevronDown,
  Gauge,
  Map,
  Menu,
  Settings,
  Ticket,
  TrendingDown,
  X,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Logo } from './Logo';

interface ItemMenu {
  titulo: string;
  items: Array<{
    href: string;
    etiqueta: string;
    icono: LucideIcon;
    soloAuth?: boolean;
  }>;
}

const GRUPOS: ItemMenu[] = [
  {
    titulo: 'Principal',
    items: [
      { href: '/dashboard', etiqueta: 'Dashboard', icono: Gauge, soloAuth: true },
      { href: '/alertas', etiqueta: 'Mis alertas', icono: BellRing, soloAuth: true },
      { href: '/notificaciones', etiqueta: 'Notificaciones', icono: Bell, soloAuth: true },
    ],
  },
  {
    titulo: 'Explorar',
    items: [
      { href: '/mapa', etiqueta: 'Mapa en tiempo real', icono: Map },
      { href: '/trenes', etiqueta: 'Buscar trenes', icono: Ticket },
      { href: '/puntualidad', etiqueta: 'Trenes impuntuales', icono: TrendingDown },
    ],
  },
  {
    titulo: 'Cuenta',
    items: [{ href: '/ajustes', etiqueta: 'Ajustes', icono: Settings, soloAuth: true }],
  },
];

export function Sidebar({ authConfigurada }: { authConfigurada: boolean }) {
  const location = useLocation();
  const [colapsado, setColapsado] = useState(false);
  const [abiertoMovil, setAbiertoMovil] = useState(false);
  const [gruposAbiertos, setGruposAbiertos] = useState<Record<string, boolean>>({
    Principal: true,
    Explorar: true,
    Cuenta: true,
  });

  const contenido = (
    <div className="flex h-full flex-col bg-sidebar">
      <div className="flex h-14 items-center justify-between border-b px-4">
        <Logo compacto={colapsado} />
        <Button
          variant="ghost"
          size="icon"
          className="hidden lg:flex"
          onClick={() => setColapsado((c) => !c)}
          aria-label={colapsado ? 'Expandir menú' : 'Contraer menú'}
        >
          <ChevronDown
            className={cn('h-4 w-4 transition-transform', colapsado ? '-rotate-90' : '')}
            aria-hidden="true"
          />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden"
          onClick={() => setAbiertoMovil(false)}
          aria-label="Cerrar menú"
        >
          <X className="h-5 w-5" aria-hidden="true" />
        </Button>
      </div>

      <nav className="flex-1 space-y-4 overflow-y-auto p-3" aria-label="Navegación principal">
        {GRUPOS.map((grupo) => {
          const itemsVisibles = grupo.items.filter((item) => !item.soloAuth || authConfigurada);
          if (itemsVisibles.length === 0) return null;
          const abierto = gruposAbiertos[grupo.titulo] ?? true;

          return (
            <div key={grupo.titulo}>
              <button
                type="button"
                className={cn(
                  'mb-1 flex w-full items-center justify-between rounded-md px-2 py-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground',
                  colapsado && 'justify-center px-0',
                )}
                onClick={() => setGruposAbiertos((g) => ({ ...g, [grupo.titulo]: !abierto }))}
                aria-expanded={abierto}
              >
                {!colapsado && <span>{grupo.titulo}</span>}
                {!colapsado && (
                  <ChevronDown
                    className={cn('h-3.5 w-3.5 transition-transform', !abierto && '-rotate-90')}
                    aria-hidden="true"
                  />
                )}
              </button>

              {abierto && (
                <div className="space-y-1">
                  {itemsVisibles.map((item) => {
                    const activo =
                      location.pathname === item.href ||
                      location.pathname.startsWith(`${item.href}/`);
                    const Icono = item.icono;
                    return (
                      <Link
                        key={item.href}
                        to={item.href}
                        onClick={() => setAbiertoMovil(false)}
                        className={cn(
                          'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                          activo
                            ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                            : 'text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                          colapsado && 'justify-center px-0',
                        )}
                        title={colapsado ? item.etiqueta : undefined}
                      >
                        <Icono className="h-4 w-4 shrink-0" aria-hidden="true" />
                        {!colapsado && <span>{item.etiqueta}</span>}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      <div className="border-t p-3 text-[11px] leading-tight text-muted-foreground">
        {!colapsado && <p>Proyecto independiente, no afiliado a Renfe. Datos: open data Renfe.</p>}
      </div>
    </div>
  );

  return (
    <>
      <aside className={cn('hidden shrink-0 border-r lg:block', colapsado ? 'w-16' : 'w-64')}>
        {contenido}
      </aside>

      <button
        type="button"
        className="fixed left-3 top-3 z-50 flex h-10 w-10 items-center justify-center rounded-md border bg-background shadow-sm lg:hidden"
        onClick={() => setAbiertoMovil(true)}
        aria-label="Abrir menú"
      >
        <Menu className="h-5 w-5" aria-hidden="true" />
      </button>

      {abiertoMovil && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => setAbiertoMovil(false)}
            aria-hidden="true"
          />
          <aside className="absolute inset-y-0 left-0 w-72 border-r bg-sidebar shadow-xl">
            {contenido}
          </aside>
        </div>
      )}
    </>
  );
}
