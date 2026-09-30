import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Bell, BellRing, Pause, Pencil, Play, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { locale } from '@/i18n';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { AlertaResponse } from '@mantirenfe/shared-types';
import type { TFunction } from 'i18next';

/** "N avisos" (singular con 1): recuento histórico que muestra cada tarjeta. */
function textoAvisos(total: number, t: TFunction): string {
  return total === 1 ? t('alertas.aviso1') : t('alertas.avisosN', { n: total });
}

export function PaginaAlertas() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [alertas, setAlertas] = useState<AlertaResponse[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [eliminando, setEliminando] = useState<AlertaResponse | null>(null);
  const [filtro, setFiltro] = useState<'TODAS' | 'ACTIVA' | 'PAUSA' | 'COMPLETADA'>('TODAS');
  const visibles = (alertas ?? []).filter((a) => filtro === 'TODAS' || a.estado === filtro);

  const cargar = useCallback(() => {
    api<AlertaResponse[]>('/alertas')
      .then(setAlertas)
      .catch((e: Error) => setError(e.message));
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const alternarEstado = async (alerta: AlertaResponse) => {
    const nuevo = alerta.estado === 'ACTIVA' ? 'PAUSA' : 'ACTIVA';
    try {
      await api(`/alertas/${alerta.id}`, { method: 'PATCH', json: { estado: nuevo } });
      toast.success(nuevo === 'ACTIVA' ? t('alertas.toastReanudada') : t('alertas.toastPausa'));
      cargar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('alertas.toastNoActualizar'));
    }
  };

  const eliminar = async () => {
    if (!eliminando) return;
    try {
      await api(`/alertas/${eliminando.id}`, { method: 'DELETE' });
      toast.success(t('alertas.toastEliminada'));
      setEliminando(null);
      cargar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('alertas.toastNoEliminar'));
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
          <h1 className="font-heading text-3xl font-bold tracking-tight">{t('menu.misAlertas')}</h1>
          <p className="text-muted-foreground">{t('alertas.subtitulo')}</p>
        </div>
        <Button asChild>
          <Link to="/alertas/nueva">
            <Plus aria-hidden="true" /> {t('dashboard.nuevaAlerta')}
          </Link>
        </Button>
      </div>

      {alertas !== null && alertas.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {(
            [
              ['TODAS', t('alertas.filtroTodas')],
              ['ACTIVA', t('alertas.filtroActivas')],
              ['PAUSA', t('alertas.filtroPausa')],
              ['COMPLETADA', t('alertas.filtroCompletadas')],
            ] as const
          ).map(([valor, etiqueta]) => (
            <Button
              key={valor}
              variant={filtro === valor ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFiltro(valor)}
            >
              {etiqueta}
            </Button>
          ))}
        </div>
      )}

      {alertas === null ? (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : alertas.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-14 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
              <BellRing className="h-7 w-7" aria-hidden="true" />
            </div>
            <div>
              <p className="font-heading text-lg font-semibold">{t('alertas.sinAlertasTitulo')}</p>
              <p className="text-sm text-muted-foreground">{t('alertas.sinAlertasTexto')}</p>
            </div>
            <Button asChild>
              <Link to="/alertas/nueva">
                <Plus aria-hidden="true" /> {t('alertas.crearPrimera')}
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {visibles.length === 0 && (
            <p className="text-sm text-muted-foreground">{t('alertas.sinEstado')}</p>
          )}
          {visibles.map((alerta) => (
            <Card key={alerta.id} className="transition-shadow hover:shadow-md">
              <CardContent className="flex flex-wrap items-center justify-between gap-4 p-5">
                <div className="space-y-1">
                  <p className="font-heading text-lg font-semibold">
                    {alerta.origenNombre}{' '}
                    <span className="text-primary" aria-hidden="true">
                      →
                    </span>{' '}
                    {alerta.destinoNombre}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {alerta.fechaViaje} ·{' '}
                    {alerta.horaDesde && alerta.horaHasta
                      ? `${alerta.horaDesde} – ${alerta.horaHasta}`
                      : alerta.horaDesde
                        ? t('alertas.desdeHora', { hora: alerta.horaDesde })
                        : t('comunes.todoElDia')}{' '}
                    · {t('alertas.cadaMin', { min: alerta.intervaloSondeoMin })} ·{' '}
                    {t('alertas.bono', { bono: alerta.bono })}
                  </p>
                  {alerta.ultimoSondeoEn && (
                    <p className="text-xs text-muted-foreground">
                      {t('alertas.ultimoSondeo', {
                        fecha: new Date(alerta.ultimoSondeoEn).toLocaleString(locale()),
                      })}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Badge
                    variant={
                      alerta.estado === 'ACTIVA'
                        ? 'exito'
                        : alerta.estado === 'PAUSA'
                          ? 'aviso'
                          : 'secondary'
                    }
                  >
                    {alerta.estado === 'ACTIVA'
                      ? t('alertas.estadoActiva')
                      : alerta.estado === 'PAUSA'
                        ? t('alertas.estadoPausa')
                        : t('alertas.completada')}
                  </Badge>
                  <Badge variant="outline" className="gap-1" title={t('alertas.avisosTitulo')}>
                    <Bell className="h-3.5 w-3.5" aria-hidden="true" />
                    {textoAvisos(alerta.avisosRecibidos ?? 0, t)}
                  </Badge>
                  <Badge variant="outline">{alerta.criterio}</Badge>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void alternarEstado(alerta)}
                    disabled={alerta.estado === 'COMPLETADA'}
                  >
                    {alerta.estado === 'ACTIVA' ? (
                      <>
                        <Pause aria-hidden="true" /> {t('alertas.pausar')}
                      </>
                    ) : (
                      <>
                        <Play aria-hidden="true" /> {t('alertas.reanudar')}
                      </>
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => navigate(`/alertas/nueva?editar=${alerta.id}`)}
                  >
                    <Pencil aria-hidden="true" /> {t('alertas.editar')}
                  </Button>
                  <Button variant="outline" size="sm" asChild>
                    <Link to={`/alertas/${alerta.id}`}>{t('alertas.avisos')}</Link>
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive"
                    onClick={() => setEliminando(alerta)}
                    aria-label={t('alertas.eliminarAria')}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!eliminando} onOpenChange={(abierto) => !abierto && setEliminando(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('alertas.dialogoTitulo')}</DialogTitle>
            <DialogDescription>
              {t('alertas.dialogoTexto', {
                origen: eliminando?.origenNombre ?? '',
                destino: eliminando?.destinoNombre ?? '',
                fecha: eliminando?.fechaViaje ?? '',
              })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEliminando(null)}>
              {t('comunes.cancelar')}
            </Button>
            <Button variant="destructive" onClick={() => void eliminar()}>
              {t('comunes.eliminar')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
