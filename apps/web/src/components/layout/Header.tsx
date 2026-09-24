import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bell, LogOut, Moon, Settings, Sun, SunMoon, User } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useAuth } from '@/hooks/useAuth';
import { api } from '@/lib/api';
import { desuscribirPush } from '@/lib/push';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [montado, setMontado] = useState(false);

  useEffect(() => setMontado(true), []);
  if (!montado) return <Button variant="ghost" size="icon" aria-label="Tema" disabled />;

  const icono =
    resolvedTheme === 'dark' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Cambiar tema">
          {icono}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => setTheme('claro')}>
          <Sun aria-hidden="true" /> Claro
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme('oscuro')}>
          <Moon aria-hidden="true" /> Oscuro
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme('sistema')}>
          <SunMoon aria-hidden="true" /> Sistema
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function Header() {
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

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b bg-background px-14 sm:px-6">
      <div className="hidden text-sm text-muted-foreground sm:block">
        Alertas y tiempo real de la red ferroviaria
      </div>
      <div className="flex items-center gap-1.5">
        <ThemeToggle />

        <Button variant="ghost" size="icon" asChild className="relative">
          <Link to="/notificaciones" aria-label="Notificaciones">
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
                  {user.email ?? 'Mi cuenta'}
                </span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="truncate">{user.email}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => navigate('/ajustes')}>
                <User aria-hidden="true" /> Mi perfil
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate('/ajustes')}>
                <Settings aria-hidden="true" /> Ajustes
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => void cerrarSesion()}>
                <LogOut aria-hidden="true" /> Cerrar sesión
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : authConfigurada ? (
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" asChild>
              <Link to="/login">Entrar</Link>
            </Button>
            <Button size="sm" asChild>
              <Link to="/registro">Registrarse</Link>
            </Button>
          </div>
        ) : (
          <span className="hidden rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-900 dark:bg-amber-900 dark:text-amber-100 sm:inline">
            Modo demo (sin Supabase)
          </span>
        )}
      </div>
    </header>
  );
}
