import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Bell, LogOut, Moon, Settings, Sun, SunMoon, User } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useAuth } from '@/hooks/useAuth';
import { api } from '@/lib/api';
import { desuscribirPush } from '@/lib/push';
import { aNextTheme, marcarEdicionTema, type TemaDom } from '@/lib/tema';
import { Button } from '@/components/ui/button';
import { SelectorIdioma } from '@/components/SelectorIdioma';
import type { PreferenciasUsuario } from '@mantirenfe/shared-types';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

function ThemeToggle() {
  const { t } = useTranslation();
  const { resolvedTheme, setTheme } = useTheme();
  const [montado, setMontado] = useState(false);
  const ordenGuardado = useRef(0);

  useEffect(() => setMontado(true), []);
  if (!montado)
    return <Button variant="ghost" size="icon" aria-label={t('cabecera.tema')} disabled />;

  const icono =
    resolvedTheme === 'dark' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />;

  const cambiar = (tema: TemaDom) => {
    marcarEdicionTema();
    setTheme(aNextTheme(tema));
    const orden = ++ordenGuardado.current;
    void (async () => {
      let actuales: PreferenciasUsuario;
      try {
        actuales = await api<PreferenciasUsuario>('/auth/preferencias');
      } catch {
        return;
      }
      if (orden !== ordenGuardado.current) return;
      try {
        await api('/auth/preferencias', { method: 'POST', json: { ...actuales, tema } });
      } catch {
        return;
      }
    })();
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={t('cabecera.cambiarTema')}>
          {icono}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => cambiar('claro')}>
          <Sun aria-hidden="true" /> {t('cabecera.temaClaro')}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => cambiar('oscuro')}>
          <Moon aria-hidden="true" /> {t('cabecera.temaOscuro')}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => cambiar('sistema')}>
          <SunMoon aria-hidden="true" /> {t('cabecera.temaSistema')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function Header() {
  const { t } = useTranslation();
  const { user, salir, authConfigurada } = useAuth();
  const navigate = useNavigate();
  const [noLeidas, setNoLeidas] = useState(0);

  useEffect(() => {
    if (!user) {
      setNoLeidas(0);
      return;
    }
    let vivo = true;
    const cargar = () => {
      api<{ noLeidas: number }>('/notificaciones/contador')
        .then((d) => {
          if (vivo) setNoLeidas(d.noLeidas);
        })
        .catch(() => undefined);
    };
    cargar();
    const intervalo = window.setInterval(cargar, 60_000);
    return () => {
      vivo = false;
      window.clearInterval(intervalo);
    };
  }, [user]);

  const cerrarSesion = async () => {
    await desuscribirPush();
    await salir();
    navigate('/');
  };

  // Dentro del WebView de la app móvil (UA MantiRenfeApp) la barra solo
  // aporta tema y login — la app ya gestiona ambos: se oculta.
  if (typeof navigator !== 'undefined' && navigator.userAgent.includes('MantiRenfeApp')) {
    return null;
  }

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b bg-background px-14 sm:px-6">
      <div className="hidden text-sm text-muted-foreground sm:block">{t('cabecera.lema')}</div>
      <div className="flex items-center gap-1.5">
        <SelectorIdioma />
        <ThemeToggle />

        <Button variant="ghost" size="icon" asChild className="relative">
          <Link to="/notificaciones" aria-label={t('cabecera.notificaciones')}>
            <Bell className="h-4 w-4" aria-hidden="true" />
            {noLeidas > 0 && (
              <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
                {noLeidas > 9 ? '9+' : noLeidas}
              </span>
            )}
          </Link>
        </Button>

        {user ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="gap-2 pl-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                  {(user.email ?? 'U').charAt(0).toUpperCase()}
                </span>
                <span className="hidden max-w-36 truncate text-sm sm:inline">
                  {user.email ?? t('cabecera.miCuenta')}
                </span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="truncate">{user.email}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => navigate('/ajustes')}>
                <User aria-hidden="true" /> {t('cabecera.miPerfil')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate('/ajustes')}>
                <Settings aria-hidden="true" /> {t('cabecera.ajustes')}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => void cerrarSesion()}>
                <LogOut aria-hidden="true" /> {t('cabecera.cerrarSesion')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : authConfigurada ? (
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" asChild>
              <Link to="/login">{t('cabecera.entrar')}</Link>
            </Button>
            <Button size="sm" asChild>
              <Link to="/registro">{t('cabecera.registrarse')}</Link>
            </Button>
          </div>
        ) : (
          <span className="hidden rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-900 dark:bg-amber-900 dark:text-amber-100 sm:inline">
            {t('cabecera.modoDemo')}
          </span>
        )}
      </div>
    </header>
  );
}
