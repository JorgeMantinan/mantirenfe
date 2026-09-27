import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut, Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { desuscribirPush } from '@/lib/push';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { SELECT_CLS } from '@/lib/ui-constants';
import type { PreferenciasUsuario } from '@mantirenfe/shared-types';

export function PaginaAjustes() {
  const { user, salir, authConfigurada } = useAuth();
  const { theme, setTheme } = useTheme();
  const navigate = useNavigate();
  const [preferencias, setPreferencias] = useState<PreferenciasUsuario | null>(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (!authConfigurada) return;
    api<PreferenciasUsuario>('/auth/preferencias')
      .then((p) => {
        setPreferencias(p);
        // Aplicar el tema guardado en la cuenta al entrar
        if (p.tema) setTheme(p.tema);
      })
      .catch(() =>
        setPreferencias({
          notificacionesPush: true,
          notificacionesEmail: false,
          recordatorioSalida: true,
          resumenViaje: true,
          minutosRecordatorio: 50,
          tema: 'sistema',
        }),
      );
  }, [authConfigurada]);

  const guardar = async (parcial: Partial<PreferenciasUsuario>) => {
    if (!preferencias) return;
    const siguiente = { ...preferencias, ...parcial };
    setPreferencias(siguiente);
    setGuardando(true);
    try {
      await api('/auth/preferencias', { method: 'POST', json: siguiente });
      toast.success('Preferencias guardadas');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo guardar');
    } finally {
      setGuardando(false);
    }
  };

  const cerrarSesion = async () => {
    await desuscribirPush();
    await salir();
    navigate('/');
  };

  if (!authConfigurada) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div>
          <h1 className="font-heading text-3xl font-bold tracking-tight">Ajustes</h1>
          <p className="text-muted-foreground">Configuración de la aplicación</p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Tema</CardTitle>
            <CardDescription>Apariencia clara u oscura</CardDescription>
          </CardHeader>
          <CardContent className="flex gap-2">
            <Button
              variant={theme === 'claro' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setTheme('claro')}
            >
              <Sun aria-hidden="true" /> Claro
            </Button>
            <Button
              variant={theme === 'oscuro' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setTheme('oscuro')}
            >
              <Moon aria-hidden="true" /> Oscuro
            </Button>
            <Button
              variant={theme === 'sistema' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setTheme('sistema')}
            >
              Sistema
            </Button>
          </CardContent>
        </Card>
        <p className="text-sm text-muted-foreground">
          Configura Supabase para desbloquear el perfil, las alertas y las notificaciones.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 animate-fade-in">
      <div>
        <h1 className="font-heading text-3xl font-bold tracking-tight">Ajustes</h1>
        <p className="text-muted-foreground">Tu perfil y notificaciones</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Cuenta</CardTitle>
          <CardDescription>Datos de tu sesión</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-sm">
            <p className="font-medium">{user?.email}</p>
            <p className="text-muted-foreground">
              Proveedor: {user?.app_metadata?.provider ?? 'email'}
            </p>
          </div>
          <Separator />
          <Button
            variant="outline"
            className="text-destructive"
            onClick={() => void cerrarSesion()}
          >
            <LogOut aria-hidden="true" /> Cerrar sesión
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Notificaciones</CardTitle>
          <CardDescription>Cómo quieres recibir los avisos</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label htmlFor="push">Notificaciones push</Label>
              <p className="text-sm text-muted-foreground">Avisos al navegador o a la PWA</p>
            </div>
            <Switch
              id="push"
              checked={preferencias?.notificacionesPush ?? true}
              disabled={!preferencias || guardando}
              onCheckedChange={(v) => void guardar({ notificacionesPush: v })}
            />
          </div>
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label htmlFor="email">Notificaciones por email</Label>
              <p className="text-sm text-muted-foreground">Resumen cuando haya plaza</p>
            </div>
            <Switch
              id="email"
              checked={preferencias?.notificacionesEmail ?? false}
              disabled={!preferencias || guardando}
              onCheckedChange={(v) => void guardar({ notificacionesEmail: v })}
            />
          </div>
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label htmlFor="recordatorio">Cuenta atrás a la salida</Label>
              <p className="text-sm text-muted-foreground">«Te faltan X minutos para tu tren»</p>
            </div>
            <Switch
              id="recordatorio"
              checked={preferencias?.recordatorioSalida ?? true}
              disabled={!preferencias || guardando}
              onCheckedChange={(v) => void guardar({ recordatorioSalida: v })}
            />
          </div>
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label htmlFor="resumen">Resumen del viaje</Label>
              <p className="text-sm text-muted-foreground">
                Por la mañana del día del viaje: horario, tren y retraso
              </p>
            </div>
            <Switch
              id="resumen"
              checked={preferencias?.resumenViaje ?? true}
              disabled={!preferencias || guardando}
              onCheckedChange={(v) => void guardar({ resumenViaje: v })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="minutos">Avisarme con antelación</Label>
            <select
              id="minutos"
              className={SELECT_CLS}
              value={preferencias?.minutosRecordatorio ?? 50}
              disabled={!preferencias || guardando}
              onChange={(e) => void guardar({ minutosRecordatorio: Number(e.target.value) })}
            >
              {[15, 30, 45, 50, 60, 90].map((m) => (
                <option key={m} value={m}>
                  {m} minutos antes
                </option>
              ))}
            </select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Apariencia</CardTitle>
          <CardDescription>Tema de la aplicación</CardDescription>
        </CardHeader>
        <CardContent className="flex gap-2">
          <Button
            variant={theme === 'claro' ? 'default' : 'outline'}
            size="sm"
            onClick={() => {
              setTheme('claro');
              void guardar({ tema: 'claro' });
            }}
          >
            <Sun aria-hidden="true" /> Claro
          </Button>
          <Button
            variant={theme === 'oscuro' ? 'default' : 'outline'}
            size="sm"
            onClick={() => {
              setTheme('oscuro');
              void guardar({ tema: 'oscuro' });
            }}
          >
            <Moon aria-hidden="true" /> Oscuro
          </Button>
          <Button
            variant={theme === 'sistema' ? 'default' : 'outline'}
            size="sm"
            onClick={() => {
              setTheme('sistema');
              void guardar({ tema: 'sistema' });
            }}
          >
            Sistema
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
