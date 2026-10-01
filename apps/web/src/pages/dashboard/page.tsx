import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { BellRing, Bell, Plus, Ticket, Train } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { TarjetaProximoViaje } from '@/pages/dashboard/TarjetaProximoViaje';
import { TarjetaActividad } from '@/pages/dashboard/TarjetaActividad';
import type {
  AlertaResponse,
  EstadisticasResponse,
  NotificacionResponse,
} from '@mantirenfe/shared-types';

export function PaginaDashboard() {
  const { t } = useTranslation();
  const { user, authConfigurada } = useAuth();
  const [alertas, setAlertas] = useState<AlertaResponse[] | null>(null);
  const [notificaciones, setNotificaciones] = useState<NotificacionResponse[] | null>(null);
  const [estadisticas, setEstadisticas] = useState<EstadisticasResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authConfigurada || (!user && authConfigurada)) return;

    if (!authConfigurada) {
      setAlertas([]);
      setNotificaciones([]);
      return;
    }

    Promise.all([
      api<AlertaResponse[]>('/alertas'),
      api<NotificacionResponse[]>('/notificaciones?noLeidas=true'),
    ])
      .then(([a, n]) => {
        setAlertas(a);
        setNotificaciones(n);
      })
      .catch((e: Error) => setError(e.message));
  }, [user, authConfigurada]);

  // «Tu actividad» es secundaria: si la llamada falla, la tarjeta no se pinta
  // y el resto del panel sigue en pie (por eso va aparte del Promise.all).
  useEffect(() => {
    if (!authConfigurada || !user) return;
    let cancelado = false;
    api<EstadisticasResponse>('/estadisticas')
      .then((datos) => {
        if (!cancelado) setEstadisticas(datos);
      })
      .catch(() => undefined);
    return () => {
      cancelado = true;
    };
  }, [user, authConfigurada]);

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm">
        {t('dashboard.errorPanel', { error })}
      </div>
    );
  }

  const activas = alertas?.filter((a) => a.estado === 'ACTIVA').length ?? 0;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-3xl font-bold tracking-tight">
            {t('dashboard.titulo')}
          </h1>
          <p className="text-muted-foreground">
            {t('dashboard.saludo', { nombre: user?.email ? `, ${user.email.split('@')[0]}` : '' })}
          </p>
        </div>
        <Button asChild>
          <Link to="/alertas/nueva">
            <Plus aria-hidden="true" /> {t('dashboard.nuevaAlerta')}
          </Link>
        </Button>
      </div>

      <TarjetaProximoViaje alertas={alertas} />

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>{t('dashboard.alertasActivas')}</CardDescription>
            <CardTitle className="flex items-center gap-2 text-3xl">
              {alertas === null ? <Skeleton className="h-8 w-12" /> : activas}
              <BellRing className="h-5 w-5 text-primary" aria-hidden="true" />
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>{t('dashboard.avisosSinLeer')}</CardDescription>
            <CardTitle className="flex items-center gap-2 text-3xl">
              {notificaciones === null ? <Skeleton className="h-8 w-12" /> : notificaciones.length}
              <Bell className="h-5 w-5 text-primary" aria-hidden="true" />
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>{t('dashboard.totalAlertas')}</CardDescription>
            <CardTitle className="flex items-center gap-2 text-3xl">
              {alertas === null ? <Skeleton className="h-8 w-12" /> : alertas.length}
              <Train className="h-5 w-5 text-primary" aria-hidden="true" />
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <TarjetaActividad datos={estadisticas} />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">{t('dashboard.ultimosAvisos')}</CardTitle>
            <CardDescription>{t('dashboard.ultimosAvisosDesc')}</CardDescription>
          </CardHeader>
          <CardContent>
            {notificaciones === null ? (
              <div className="space-y-2">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : notificaciones.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                {t('dashboard.sinAvisos')}
              </div>
            ) : (
              <ul className="divide-y">
                {notificaciones.slice(0, 5).map((n) => (
                  <li key={n.id} className="flex items-start gap-3 py-3">
                    <span
                      className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary"
                      aria-hidden="true"
                    />
                    <div>
                      <p className="text-sm font-medium">{n.titulo}</p>
                      <p className="text-sm text-muted-foreground">{n.cuerpo}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-xl">{t('menu.misAlertas')}</CardTitle>
            <CardDescription>{t('dashboard.misAlertasDesc')}</CardDescription>
          </CardHeader>
          <CardContent>
            {alertas === null ? (
              <div className="space-y-2">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : alertas.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-8 text-center">
                <Ticket className="h-10 w-10 text-muted-foreground/50" aria-hidden="true" />
                <p className="text-sm text-muted-foreground">{t('dashboard.sinAlertas')}</p>
                <Button asChild size="sm">
                  <Link to="/alertas/nueva">{t('comunes.crearAlerta')}</Link>
                </Button>
              </div>
            ) : (
              <ul className="space-y-2">
                {alertas.slice(0, 5).map((a) => (
                  <li
                    key={a.id}
                    className="flex items-center justify-between rounded-lg border p-3 text-sm"
                  >
                    <div>
                      <p className="font-medium">
                        {a.origenNombre} → {a.destinoNombre}
                      </p>
                      <p className="text-muted-foreground">
                        {a.fechaViaje} · {a.horaDesde ?? t('comunes.todoElDia')}
                      </p>
                    </div>
                    <Badge variant={a.estado === 'ACTIVA' ? 'exito' : 'secondary'}>
                      {a.estado === 'ACTIVA'
                        ? t('alertas.estadoActiva')
                        : a.estado === 'PAUSA'
                          ? t('alertas.estadoPausa')
                          : t('dashboard.estadoHecha')}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
