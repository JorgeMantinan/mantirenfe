import { useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import {
  Bell,
  BellRing,
  ChevronDown,
  CircleSlash,
  Gauge,
  Map,
  MapPin,
  Menu,
  Settings,
  Ticket,
  TrendingDown,
  TriangleAlert,
  X,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Logo } from './Logo';

interface ItemMenu {
  id: string;
  titulo: string;
  items: Array<{
    href: string;
    etiqueta: string;
    icono: LucideIcon;
    soloAuth?: boolean;
  }>;
}

function grupos(t: TFunction): ItemMenu[] {
  return [
    {
      id: 'principal',
      titulo: t('menu.grupoPrincipal'),
      items: [
        {
          href: '/dashboard',
          etiqueta: t('menu.dashboard'),
          icono: Gauge,
          soloAuth: true,
        },
        {
          href: '/alertas',
          etiqueta: t('menu.misAlertas'),
          icono: BellRing,
          soloAuth: true,
        },
        {
          href: '/notificaciones',
          etiqueta: t('menu.notificaciones'),
          icono: Bell,
          soloAuth: true,
        },
      ],
    },
    {
      id: 'explorar',
      titulo: t('menu.grupoExplorar'),
      items: [
        { href: '/mapa', etiqueta: t('menu.mapa'), icono: Map },
        { href: '/incidencias', etiqueta: t('menu.incidencias'), icono: TriangleAlert },
        { href: '/suprimidos', etiqueta: t('menu.suprimidos'), icono: CircleSlash },
        { href: '/trenes', etiqueta: t('menu.buscarTrenes'), icono: Ticket },
        { href: '/estaciones', etiqueta: t('menu.estaciones'), icono: MapPin },
        { href: '/puntualidad', etiqueta: t('menu.impuntuales'), icono: TrendingDown },
      ],
    },
    {
      id: 'cuenta',
      titulo: t('menu.grupoCuenta'),
      items: [{ href: '/ajustes', etiqueta: t('menu.ajustes'), icono: Settings, soloAuth: true }],
    },
  ];
}

export function Sidebar({ authConfigurada }: { authConfigurada: boolean }) {
  const { t } = useTranslation();
  const location = useLocation();
  const [colapsado, setColapsado] = useState(false);
  const [abiertoMovil, setAbiertoMovil] = useState(false);
  const [gruposAbiertos, setGruposAbiertos] = useState<Record<string, boolean>>({
    principal: true,
    explorar: true,
    cuenta: true,
  });
  // El menú solo cambia de texto al cambiar el idioma
  const menu = useMemo(() => grupos(t), [t]);

  const contenido = (
    <div className="flex h-full flex-col bg-sidebar">
      <div className="flex h-14 items-center justify-between border-b px-4">
        <Logo compacto={colapsado} />
        <Button
          variant="ghost"
          size="icon"
          className="hidden lg:flex"
          onClick={() => setColapsado((c) => !c)}
          aria-label={colapsado ? t('menu.expandir') : t('menu.contraer')}
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
          aria-label={t('menu.cerrar')}
        >
          <X className="h-5 w-5" aria-hidden="true" />
        </Button>
      </div>

      <nav className="flex-1 space-y-4 overflow-y-auto p-3" aria-label={t('menu.navegar')}>
        {menu.map((grupo) => {
          const itemsVisibles = grupo.items.filter((item) => !item.soloAuth || authConfigurada);
          if (itemsVisibles.length === 0) return null;
          const abierto = gruposAbiertos[grupo.id] ?? true;

          return (
            <div key={grupo.id}>
              <button
                type="button"
                className={cn(
                  'mb-1 flex w-full items-center justify-between rounded-md px-2 py-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground',
                  colapsado && 'justify-center px-0',
                )}
                onClick={() => setGruposAbiertos((g) => ({ ...g, [grupo.id]: !abierto }))}
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
        {!colapsado && <p>{t('menu.pie')}</p>}
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
        aria-label={t('menu.abrir')}
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
