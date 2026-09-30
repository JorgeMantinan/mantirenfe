import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Bell, BellOff, CheckCheck, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { locale } from '@/i18n';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { NotificacionResponse, PushConfigResponse } from '@mantirenfe/shared-types';

function urlBase64AUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const base64Normalizada = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64Normalizada);
  const buffer = new Uint8Array(new ArrayBuffer(rawData.length));
  for (let i = 0; i < rawData.length; i++) {
    buffer[i] = rawData.charCodeAt(i);
  }
  return buffer;
}

export function PaginaNotificaciones() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [notificaciones, setNotificaciones] = useState<NotificacionResponse[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activandoPush, setActivandoPush] = useState(false);

  const cargar = useCallback(() => {
    api<NotificacionResponse[]>('/notificaciones')
      .then(setNotificaciones)
      .catch((e: Error) => setError(e.message));
  }, []);

  useEffect(() => {
    if (user) cargar();
  }, [user, cargar]);

  const marcarTodas = async () => {
    const ids = (notificaciones ?? []).filter((n) => !n.leida).map((n) => n.id);
    if (ids.length === 0) return;
    try {
      await api('/notificaciones/marcar-leidas', { method: 'PATCH', json: { ids } });
      toast.success(t('notificaciones.marcarOk'));
      cargar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('comunes.error'));
    }
  };

  const limpiarLista = async () => {
    if ((notificaciones ?? []).length === 0) return;
    if (!window.confirm(t('notificaciones.vaciarConfirm'))) return;
    try {
      await api('/notificaciones', { method: 'DELETE' });
      setNotificaciones([]);
      toast.success(t('notificaciones.vaciada'));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('comunes.error'));
    }
  };

  const activarPush = async () => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      toast.error(t('notificaciones.sinSoporte'));
      return;
    }
    setActivandoPush(true);
    try {
      const permiso = await Notification.requestPermission();
      if (permiso !== 'granted') {
        toast.error(t('notificaciones.permisoDenegado'));
        return;
      }

      const config = await api<PushConfigResponse>('/notificaciones/push-config');
      if (!config.publicKey) {
        toast.error(t('notificaciones.pushNoConfig'));
        return;
      }

      const registro = await navigator.serviceWorker.ready;
      const suscripcion =
        (await registro.pushManager.getSubscription()) ??
        (await registro.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64AUint8Array(config.publicKey),
        }));

      await api('/notificaciones/push-subscribe', {
        method: 'POST',
        json: suscripcion.toJSON(),
      });
      toast.success(t('notificaciones.pushOk'));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('notificaciones.pushError'));
    } finally {
      setActivandoPush(false);
    }
  };

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-3xl font-bold tracking-tight">
            {t('cabecera.notificaciones')}
          </h1>
          <p className="text-muted-foreground">{t('notificaciones.subtitulo')}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => void activarPush()} disabled={activandoPush}>
            <Bell aria-hidden="true" />
            {activandoPush ? t('notificaciones.activando') : t('notificaciones.activarPush')}
          </Button>
          <Button variant="secondary" onClick={() => void marcarTodas()}>
            <CheckCheck aria-hidden="true" /> {t('notificaciones.marcarLeidas')}
          </Button>
          <Button variant="ghost" onClick={() => void limpiarLista()}>
            <Trash2 aria-hidden="true" /> {t('notificaciones.limpiarLista')}
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">{t('notificaciones.bandeja')}</CardTitle>
          <CardDescription>{t('notificaciones.bandejaDesc')}</CardDescription>
        </CardHeader>
        <CardContent>
          {notificaciones === null ? (
            <div className="space-y-2">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : notificaciones.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <BellOff className="h-10 w-10 text-muted-foreground/50" aria-hidden="true" />
              <p className="text-sm text-muted-foreground">{t('notificaciones.sinNotifs')}</p>
            </div>
          ) : (
            <ul className="divide-y">
              {notificaciones.map((n) => (
                <li
                  key={n.id}
                  className={`flex items-start gap-3 py-4 ${n.leida ? 'opacity-70' : ''}`}
                >
                  <span
                    className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${
                      n.leida ? 'bg-muted' : 'bg-primary'
                    }`}
                    aria-hidden="true"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-medium">{n.titulo}</p>
                      <time className="text-xs text-muted-foreground">
                        {new Date(n.creadaEn).toLocaleString(locale())}
                      </time>
                    </div>
                    <p className="text-sm text-muted-foreground">{n.cuerpo}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
