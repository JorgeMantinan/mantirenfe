import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeftRight, Bell, BellRing, Pause, Pencil, Play, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { locale } from '@/i18n';
import { etiquetaCriterio } from '@/lib/alertas';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
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

/** Fila de la lista: la ida (ancla) y, si la tiene, su vuelta emparejada. */
type FilaAlerta = { ancla: AlertaResponse; vuelta: AlertaResponse | null };

/**
 * Empareja ida/vuelta siguiendo el orden que devuelve la API: una fila sin
 * `grupoId` (ancla) cuya SIGUIENTE fila apunte a ella. Esa segunda no se pinta
 * como fila suelta; una huérfana (vuelta sin ancla en la página) sí.
 */
function agruparParejas(alertas: AlertaResponse[]): FilaAlerta[] {
  const filas: FilaAlerta[] = [];
  let i = 0;
  while (i < alertas.length) {
    const ancla = alertas[i];
    const vuelta = alertas[i + 1];
    if (ancla === undefined) break;
    if (!ancla.grupoId && vuelta !== undefined && vuelta.grupoId === ancla.id) {
      filas.push({ ancla, vuelta });
      i += 2;
    } else {
      filas.push({ ancla, vuelta: null });
      i += 1;
    }
  }
  return filas;
}

/** Etiqueta del estado de una alerta (badge con su color correspondiente). */
function BadgeEstado({ alerta, t }: { alerta: AlertaResponse; t: TFunction }) {
  return (
    <Badge
      variant={
        alerta.estado === 'ACTIVA' ? 'exito' : alerta.estado === 'PAUSA' ? 'aviso' : 'secondary'
      }
    >
      {alerta.estado === 'ACTIVA'
        ? t('alertas.estadoActiva')
        : alerta.estado === 'PAUSA'
          ? t('alertas.estadoPausa')
          : t('alertas.completada')}
    </Badge>
  );
}

/** Una de las dos líneas de ruta de la tarjeta agrupada: navega a SU tramo. */
function TramoRuta({ alerta, tramo, t }: { alerta: AlertaResponse; tramo: string; t: TFunction }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{tramo}</p>
      <Link
        to={`/alertas/${alerta.id}`}
        className="-mx-2 block rounded-md px-2 py-1 transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
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
      </Link>
      <div className="flex flex-wrap items-center gap-2">
        <BadgeEstado alerta={alerta} t={t} />
        <Badge variant="outline">{etiquetaCriterio(t, alerta.criterio)}</Badge>
      </div>
    </div>
  );
}

/**
 * Tarjeta agrupada "Ida y vuelta": dos líneas de ruta (cada una a su detalle)
 * y controles de estado/edición/borrado que actúan sobre el id del ANCLA, que
 * la API propaga a la pareja.
 */
function TarjetaIdaVuelta({
  ancla,
  vuelta,
  t,
  onAlternar,
  onEditar,
  onEliminar,
}: {
  ancla: AlertaResponse;
  vuelta: AlertaResponse;
  t: TFunction;
  onAlternar: (alerta: AlertaResponse) => void;
  onEditar: (id: string) => void;
  onEliminar: (alerta: AlertaResponse) => void;
}) {
  return (
    <Card className="transition-shadow hover:shadow-md">
      <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1 space-y-3">
          <Badge variant="secondary" className="w-fit gap-1">
            <ArrowLeftRight className="h-3.5 w-3.5" aria-hidden="true" />
            {t('alertas.idaVuelta')}
          </Badge>
          <TramoRuta alerta={ancla} tramo={t('alertas.ida')} t={t} />
          <Separator />
          <TramoRuta alerta={vuelta} tramo={t('alertas.vuelta')} t={t} />
        </div>
        <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2">
          <Badge variant="outline" className="gap-1" title={t('alertas.avisosTitulo')}>
            <Bell className="h-3.5 w-3.5" aria-hidden="true" />
            {textoAvisos(ancla.avisosRecibidos ?? 0, t)}
          </Badge>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onAlternar(ancla)}
            disabled={ancla.estado === 'COMPLETADA'}
          >
            {ancla.estado === 'ACTIVA' ? (
              <>
                <Pause aria-hidden="true" /> {t('alertas.pausar')}
              </>
            ) : (
              <>
                <Play aria-hidden="true" /> {t('alertas.reanudar')}
              </>
            )}
          </Button>
          <Button variant="outline" size="sm" onClick={() => onEditar(ancla.id)}>
            <Pencil aria-hidden="true" /> {t('alertas.editar')}
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link to={`/alertas/${ancla.id}`}>{t('alertas.avisos')}</Link>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="text-destructive"
            onClick={() => onEliminar(ancla)}
            aria-label={t('alertas.eliminarAria')}
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function PaginaAlertas() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [alertas, setAlertas] = useState<AlertaResponse[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [eliminando, setEliminando] = useState<AlertaResponse | null>(null);
  const [filtro, setFiltro] = useState<'TODAS' | 'ACTIVA' | 'PAUSA' | 'COMPLETADA'>('TODAS');
  const visibles = (alertas ?? []).filter((a) => filtro === 'TODAS' || a.estado === filtro);
  const filas = agruparParejas(visibles);
  const filaAEliminar = filas.find((f) => f.ancla.id === eliminando?.id) ?? null;

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
          {filas.map(({ ancla: alerta, vuelta }) =>
            vuelta ? (
              <TarjetaIdaVuelta
                key={alerta.id}
                ancla={alerta}
                vuelta={vuelta}
                t={t}
                onAlternar={alternarEstado}
                onEditar={(id) => navigate(`/alertas/nueva?editar=${id}`)}
                onEliminar={setEliminando}
              />
            ) : (
              <Card key={alerta.id} className="transition-shadow hover:shadow-md">
                <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                  <div className="min-w-0 space-y-1 sm:flex-1">
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
                  <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2">
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
                    <Badge variant="outline">{etiquetaCriterio(t, alerta.criterio)}</Badge>
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
            ),
          )}
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
              {filaAEliminar?.vuelta && (
                <>
                  {' '}
                  {t('alertas.dialogoTambienVuelta', {
                    origen: filaAEliminar.vuelta.origenNombre,
                    destino: filaAEliminar.vuelta.destinoNombre,
                  })}
                </>
              )}
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
