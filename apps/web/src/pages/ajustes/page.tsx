import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
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
import { aNextTheme, deNextTheme, edicionTemaReciente, marcarEdicionTema } from '@/lib/tema';
import type { TemaDom } from '@/lib/tema';
import type { PreferenciasUsuario } from '@mantirenfe/shared-types';

export function PaginaAjustes() {
  const { t } = useTranslation();
  const { user, salir, authConfigurada } = useAuth();
  const { theme, setTheme } = useTheme();
  const navigate = useNavigate();
  const [preferencias, setPreferencias] = useState<PreferenciasUsuario | null>(null);
  const [guardando, setGuardando] = useState(false);
  const temaActual = deNextTheme(theme);

  useEffect(() => {
    if (!authConfigurada) return;
    let cancelado = false;
    api<PreferenciasUsuario>('/auth/preferencias')
      .then((p) => {
        if (cancelado) return;
        setPreferencias(p);
        if (p.tema && !edicionTemaReciente()) setTheme(aNextTheme(p.tema));
        // Los avisos por email están retirados de la web: si quedaba activada
        // de una versión anterior, se apaga en silencio
        if (p.notificacionesEmail) {
          const sinEmail = { ...p, notificacionesEmail: false };
          setPreferencias(sinEmail);
          void api('/auth/preferencias', { method: 'POST', json: sinEmail }).catch(() => undefined);
        }
      })
      .catch(() => {
        if (cancelado) return;
        setPreferencias({
          notificacionesPush: true,
          notificacionesEmail: false,
          recordatorioSalida: true,
          resumenViaje: true,
          minutosRecordatorio: 50,
          tema: 'sistema',
        });
      });
    return () => {
      cancelado = true;
    };
  }, [authConfigurada, setTheme]);

  const elegirTema = (tema: TemaDom) => {
    marcarEdicionTema();
    setTheme(aNextTheme(tema));
    if (authConfigurada) void guardar({ tema });
  };

  const guardar = async (parcial: Partial<PreferenciasUsuario>) => {
    const base =
      preferencias ?? (await api<PreferenciasUsuario>('/auth/preferencias').catch(() => null));
    if (!base) return;
    const siguiente = { ...base, tema: temaActual, ...parcial };
    // Se pinta ya para que el cambio se note al instante
    setPreferencias(siguiente);
    setGuardando(true);
    try {
      await api('/auth/preferencias', { method: 'POST', json: siguiente });
      toast.success(t('ajustes.guardadas'));
    } catch (e) {
      // El servidor no se quedó con el cambio: se revierte al valor anterior
      setPreferencias(base);
      toast.error(e instanceof Error && e.message ? e.message : t('ajustes.noGuardar'));
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
          <h1 className="font-heading text-3xl font-bold tracking-tight">
            {t('cabecera.ajustes')}
          </h1>
          <p className="text-muted-foreground">{t('ajustes.subtituloApp')}</p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">{t('ajustes.temaTitulo')}</CardTitle>
            <CardDescription>{t('ajustes.temaDesc')}</CardDescription>
          </CardHeader>
          <CardContent className="flex gap-2">
            <Button
              variant={temaActual === 'claro' ? 'default' : 'outline'}
              size="sm"
              onClick={() => elegirTema('claro')}
            >
              <Sun aria-hidden="true" /> {t('cabecera.temaClaro')}
            </Button>
            <Button
              variant={temaActual === 'oscuro' ? 'default' : 'outline'}
              size="sm"
              onClick={() => elegirTema('oscuro')}
            >
              <Moon aria-hidden="true" /> {t('cabecera.temaOscuro')}
            </Button>
            <Button
              variant={temaActual === 'sistema' ? 'default' : 'outline'}
              size="sm"
              onClick={() => elegirTema('sistema')}
            >
              {t('cabecera.temaSistema')}
            </Button>
          </CardContent>
        </Card>
        <p className="text-sm text-muted-foreground">{t('ajustes.supabaseInfo')}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 animate-fade-in">
      <div>
        <h1 className="font-heading text-3xl font-bold tracking-tight">{t('cabecera.ajustes')}</h1>
        <p className="text-muted-foreground">{t('ajustes.subtitulo')}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">{t('ajustes.cuentaTitulo')}</CardTitle>
          <CardDescription>{t('ajustes.cuentaDesc')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-sm">
            <p className="font-medium">{user?.email}</p>
            <p className="text-muted-foreground">
              {t('ajustes.proveedor', { proveedor: user?.app_metadata?.provider ?? 'email' })}
            </p>
          </div>
          <Separator />
          <Button
            variant="outline"
            className="text-destructive"
            onClick={() => void cerrarSesion()}
          >
            <LogOut aria-hidden="true" /> {t('cabecera.cerrarSesion')}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">{t('ajustes.notificacionesTitulo')}</CardTitle>
          <CardDescription>{t('ajustes.notificacionesDesc')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label htmlFor="push">{t('ajustes.pushLabel')}</Label>
              <p className="text-sm text-muted-foreground">{t('ajustes.pushDesc')}</p>
            </div>
            <Switch
              id="push"
              checked={preferencias?.notificacionesPush ?? true}
              disabled={!preferencias || guardando}
              onCheckedChange={(v) => void guardar({ notificacionesPush: v })}
            />
          </div>
          {/* Los avisos por email se han retirado (por defecto, apagados) */}
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label htmlFor="recordatorio">{t('ajustes.recordatorioLabel')}</Label>
              <p className="text-sm text-muted-foreground">{t('ajustes.recordatorioDesc')}</p>
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
              <Label htmlFor="resumen">{t('ajustes.resumenLabel')}</Label>
              <p className="text-sm text-muted-foreground">{t('ajustes.resumenDesc')}</p>
            </div>
            <Switch
              id="resumen"
              checked={preferencias?.resumenViaje ?? true}
              disabled={!preferencias || guardando}
              onCheckedChange={(v) => void guardar({ resumenViaje: v })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="minutos">{t('ajustes.antelacionLabel')}</Label>
            <select
              id="minutos"
              className={SELECT_CLS}
              value={preferencias?.minutosRecordatorio ?? 50}
              disabled={!preferencias || guardando}
              onChange={(e) => void guardar({ minutosRecordatorio: Number(e.target.value) })}
            >
              {[15, 30, 45, 50, 60, 90].map((m) => (
                <option key={m} value={m}>
                  {t('ajustes.antelacionOpcion', { min: m })}
                </option>
              ))}
            </select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">{t('ajustes.aparienciaTitulo')}</CardTitle>
          <CardDescription>{t('ajustes.aparienciaDesc')}</CardDescription>
        </CardHeader>
        <CardContent className="flex gap-2">
          <Button
            variant={temaActual === 'claro' ? 'default' : 'outline'}
            size="sm"
            onClick={() => elegirTema('claro')}
          >
            <Sun aria-hidden="true" /> {t('cabecera.temaClaro')}
          </Button>
          <Button
            variant={temaActual === 'oscuro' ? 'default' : 'outline'}
            size="sm"
            onClick={() => elegirTema('oscuro')}
          >
            <Moon aria-hidden="true" /> {t('cabecera.temaOscuro')}
          </Button>
          <Button
            variant={temaActual === 'sistema' ? 'default' : 'outline'}
            size="sm"
            onClick={() => elegirTema('sistema')}
          >
            {t('cabecera.temaSistema')}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
