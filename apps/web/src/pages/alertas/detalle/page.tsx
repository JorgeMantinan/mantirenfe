import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft,
  ArrowLeftRight,
  BellRing,
  CalendarPlus,
  Coins,
  RefreshCw,
  Share2,
  Train,
  TriangleAlert,
} from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { locale } from '@/i18n';
import { etiquetaCriterio, etiquetaDiasSemana } from '@/lib/alertas';
import { fechaCorta } from '@/lib/proximoViaje';
import { ListaIncidencias } from '@/components/ListaIncidencias';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { construirIcs, descargarIcs, nombreFicheroIcs } from '@/lib/ics';
import { incidenciaAfectaA, type IncidenciaResponse } from '@/lib/incidencias';
import {
  agruparContagos,
  agruparPrecios,
  anchoBarra,
  consejoPrecio,
  esSeriePlana,
  formatearPrecio,
  recortarContagos,
  textoSerieCompacta,
  textoSondeosOcultos,
} from '@/lib/precios';
import {
  duracionCorta,
  horaGtfs,
  textoConexion,
  type AlertaResponse,
  type AvisoAlertaResponse,
  type CriterioAlerta,
  type EstadoSerializado,
  type PuntoPrecio,
} from '@mantirenfe/shared-types';
import type { TFunction } from 'i18next';

/** "hace X min" si es reciente; si no, fecha legible en el idioma activo. */
function haceCuanto(iso: string, t: TFunction): string {
  const minutos = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutos < 1) return t('detalleAlerta.haceMomento');
  if (minutos < 60) return t('detalleAlerta.haceMin', { min: minutos });
  return new Date(iso).toLocaleString(locale());
}

/** Todos los criterios vigilados por la alerta (legada: solo `criterio`). */
function criteriosDe(alerta: AlertaResponse): CriterioAlerta[] {
  return alerta.criterios?.length ? alerta.criterios : [alerta.criterio];
}

/**
 * Mensaje de la tarjeta de estado cuando `ultimoEstado` no tiene filas.
 *
 * Con criterio RETRASO el estado vacío no significa «no hay trenes»: significa
 * que ninguno va con retraso ahora mismo, así que se avisa en esos términos
 * (y se distingue de «todavía no se ha sondeado»). El resto de criterios
 * mantienen su mensaje habitual.
 */
function mensajeEstadoVacio(alerta: AlertaResponse, t: TFunction): string {
  const franja =
    alerta.horaDesde || alerta.horaHasta
      ? `${alerta.horaDesde ?? '00:00'}–${alerta.horaHasta ?? '23:59'}`
      : null;
  if (alerta.criterio === 'RETRASO') {
    if (!alerta.ultimoSondeoEn) {
      return t('detalleAlerta.vacioRetrasoSinSondeo', { min: alerta.intervaloSondeoMin });
    }
    const donde = franja
      ? t('detalleAlerta.vacioRetrasoFranja', { franja })
      : t('detalleAlerta.vacioRetrasoRuta');
    // N solo es conocible si se vigila un tren concreto
    const vigilancia = alerta.numeroTren ? t('detalleAlerta.vigilanciaTren') : '';
    return `${donde}${vigilancia}`;
  }
  if (alerta.criterio === 'PRECIO') {
    return t('detalleAlerta.vacioPrecio', { min: alerta.intervaloSondeoMin });
  }
  if (alerta.criterio === 'DISPONIBILIDAD' || alerta.criterio === 'APERTURA_VENTA') {
    return t('detalleAlerta.vacioPlazas', { min: alerta.intervaloSondeoMin });
  }
  return t('detalleAlerta.vacioSoloDisponibilidad');
}

export function PaginaDetalleAlerta() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const [alerta, setAlerta] = useState<AlertaResponse | null>(null);
  const [avisos, setAvisos] = useState<AvisoAlertaResponse[]>([]);
  const [incidencias, setIncidencias] = useState<IncidenciaResponse[]>([]);
  const [precios, setPrecios] = useState<PuntoPrecio[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const trenes: EstadoSerializado[] = alerta?.ultimoEstado ?? [];
  const seriesPrecios = agruparPrecios(precios);

  const cargar = useCallback(() => {
    if (!id) return;
    setCargando(true);
    Promise.all([
      api<AlertaResponse>(`/alertas/${id}`),
      // Histórico de avisos de ESA alerta: ya viene filtrado por la API
      api<AvisoAlertaResponse[]>(`/alertas/${id}/avisos`),
      // Si el feed de incidencias no responde, el detalle se muestra igual
      api<IncidenciaResponse[]>('/incidencias').catch(() => [] as IncidenciaResponse[]),
      // Histórico de precios: existe para disponibilidad y precio
      api<PuntoPrecio[]>(`/alertas/${id}/precios`).catch(() => [] as PuntoPrecio[]),
    ])
      .then(([a, avisosDeLaAlerta, incidenciasActivas, historial]) => {
        setAlerta(a);
        setPrecios(historial);
        setIncidencias(
          incidenciasActivas.filter((inc) =>
            incidenciaAfectaA(inc, [a.origenNombre, a.destinoNombre]),
          ),
        );
        setAvisos(avisosDeLaAlerta);
        // Al abrir el detalle se marcan como leídos los avisos de esta alerta
        const sinLeer = avisosDeLaAlerta.filter((n) => !n.leida).map((n) => n.id);
        if (sinLeer.length > 0) {
          void api('/notificaciones/marcar-leidas', { method: 'PATCH', json: { ids: sinLeer } })
            .then(() => setAvisos(avisosDeLaAlerta.map((n) => ({ ...n, leida: true }))))
            .catch(() => undefined);
        }
        setError(null);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setCargando(false));
  }, [id]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const compartir = async () => {
    if (!alerta) return;
    const url = `${window.location.origin}/alertas/nueva?origen=${encodeURIComponent(
      alerta.origenNombre,
    )}&destino=${encodeURIComponent(alerta.destinoNombre)}&fecha=${alerta.fechaViaje}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success(t('detalleAlerta.enlaceCopiado'));
    } catch {
      window.prompt(t('detalleAlerta.promptCompartir'), url);
    }
  };

  const anadirAlCalendario = () => {
    if (!alerta) return;
    try {
      descargarIcs(nombreFicheroIcs(alerta), construirIcs(alerta));
      toast.success(t('detalleAlerta.eventoDescargado'));
    } catch {
      toast.error(t('detalleAlerta.errorIcs'));
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-4 animate-fade-in">
      <div className="space-y-1">
        <Button variant="ghost" size="sm" asChild className="-ml-2">
          <Link to="/alertas">
            <ArrowLeft aria-hidden="true" /> {t('detalleAlerta.volver')}
          </Link>
        </Button>
        <h1 className="font-heading text-3xl font-bold tracking-tight">
          {t('detalleAlerta.titulo')}
        </h1>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm">
          {error}
        </div>
      )}

      {cargando ? (
        <>
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-20 w-full" />
        </>
      ) : (
        alerta && (
          <>
            <ListaIncidencias
              incidencias={incidencias}
              variante="caja"
              cabecera={
                <p className="flex items-center gap-2 font-semibold text-amber-700 dark:text-amber-300">
                  <TriangleAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
                  {t('detalleAlerta.incidenciaTitulo')}
                </p>
              }
              pie={
                <Link to="/incidencias" className="mt-2 inline-block font-medium underline">
                  {t('detalleAlerta.verTodas')}
                </Link>
              }
            />

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-xl">
                  <BellRing className="h-5 w-5 text-primary" aria-hidden="true" />
                  {alerta.origenNombre} → {alerta.destinoNombre}
                </CardTitle>
                <CardDescription>
                  {alerta.fechaFlexible
                    ? t('detalleAlerta.rangoFechas', {
                        desde: fechaCorta(alerta.fechaDesde ?? alerta.fechaViaje),
                        hasta: fechaCorta(alerta.fechaHasta ?? alerta.fechaViaje),
                      })
                    : alerta.fechaViaje}{' '}
                  ·{' '}
                  {alerta.horaDesde || alerta.horaHasta
                    ? `${alerta.horaDesde ?? '00:00'} – ${alerta.horaHasta ?? '23:59'}`
                    : t('comunes.todoElDia')}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap items-center gap-2 text-sm">
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
                {criteriosDe(alerta).map((c) => (
                  <Badge key={c} variant="outline">
                    {etiquetaCriterio(t, c)}
                  </Badge>
                ))}
                {criteriosDe(alerta).includes('PRECIO') && alerta.precioObjetivo != null && (
                  <Badge variant="aviso">
                    {t('alertas.precioObjetivo', {
                      precio: formatearPrecio(alerta.precioObjetivo),
                    })}
                  </Badge>
                )}
                {alerta.fechaFlexible && (
                  <Badge variant="aviso">{t('nuevaAlerta.frecuenciaFlexible')}</Badge>
                )}
                {alerta.recurrente && (
                  <Badge variant="aviso">{etiquetaDiasSemana(t, alerta.diasSemana)}</Badge>
                )}
                <Badge variant="outline">
                  {t('alertas.cadaMin', { min: alerta.intervaloSondeoMin })}
                </Badge>
                <Badge variant="outline">{alerta.bono}</Badge>
                {alerta.numeroTren && (
                  <Badge variant="outline">
                    {t('dashboard.trenNumero', { numero: alerta.numeroTren })}
                  </Badge>
                )}
                <span className="text-muted-foreground">
                  {t('alertas.ultimoSondeo', {
                    fecha: alerta.ultimoSondeoEn
                      ? new Date(alerta.ultimoSondeoEn).toLocaleString(locale())
                      : t('detalleAlerta.sondeoNinguno'),
                  })}
                </span>
                <div className="ml-auto flex flex-wrap items-center gap-2">
                  <Button variant="outline" size="sm" onClick={compartir}>
                    <Share2 aria-hidden="true" /> {t('detalleAlerta.compartir')}
                  </Button>
                  <Button variant="outline" size="sm" onClick={anadirAlCalendario}>
                    <CalendarPlus aria-hidden="true" /> {t('detalleAlerta.calendario')}
                  </Button>
                </div>
                {alerta.grupo && (
                  <Link
                    to={`/alertas/${alerta.grupo.id}`}
                    className="flex w-full items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 transition-colors hover:bg-accent"
                  >
                    <ArrowLeftRight className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                    <span className="font-medium">{t('alertas.idaVuelta')}</span>
                    <Badge variant="outline">
                      {alerta.grupoId ? t('alertas.vuelta') : t('alertas.ida')}
                    </Badge>
                    <span className="min-w-0 truncate text-muted-foreground">
                      {alerta.grupo.origenNombre} → {alerta.grupo.destinoNombre} ·{' '}
                      {alerta.grupo.fechaViaje}
                    </span>
                  </Link>
                )}
              </CardContent>
              {alerta.notas && (
                <CardContent className="pt-0 text-sm text-muted-foreground">
                  {t('detalleAlerta.notas', { texto: alerta.notas })}
                </CardContent>
              )}
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
                <div className="space-y-1.5">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Train className="h-5 w-5 text-primary" aria-hidden="true" />
                    {alerta.criterio === 'RETRASO'
                      ? t('detalleAlerta.retrasosHoy')
                      : t('detalleAlerta.plazasHoy')}
                  </CardTitle>
                  <CardDescription>
                    {alerta.ultimoSondeoEn
                      ? t('detalleAlerta.sondeoHace', {
                          hace: haceCuanto(alerta.ultimoSondeoEn, t),
                        })
                      : t('detalleAlerta.sondeoSinDatos')}
                  </CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={cargar} disabled={cargando}>
                  <RefreshCw aria-hidden="true" /> {t('estaciones.actualizar')}
                </Button>
              </CardHeader>
              <CardContent>
                {trenes.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left text-muted-foreground">
                          <th className="py-2 pr-3 font-medium">{t('detalleAlerta.colHora')}</th>
                          <th className="py-2 pr-3 font-medium">{t('tabla.tren')}</th>
                          <th className="py-2 pr-3 font-medium">{t('tabla.llegada')}</th>
                          <th className="py-2 pr-3 font-medium">{t('detalleAlerta.colPlazas')}</th>
                          <th className="py-2 font-medium text-right">
                            {t('detalleAlerta.colPrecioDesde')}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {trenes.map((tren) => (
                          <tr
                            key={`${tren.trenId}-${tren.salida}`}
                            className="border-b last:border-b-0"
                          >
                            <td className="py-2 pr-3 font-medium">{horaGtfs(tren.salida)}</td>
                            <td className="py-2 pr-3">
                              <span>{tren.numeroTren || '—'}</span>
                              {tren.tipoTren && (
                                <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                                  {tren.tipoTren}
                                </span>
                              )}
                              {tren.tramo === 'conexion' && (
                                <p className="text-xs text-muted-foreground">
                                  {textoConexion(tren)}
                                </p>
                              )}
                            </td>
                            <td className="py-2 pr-3 text-muted-foreground">
                              {[
                                tren.horaLlegada,
                                typeof tren.duracionMin === 'number'
                                  ? duracionCorta(tren.duracionMin)
                                  : null,
                              ]
                                .filter(Boolean)
                                .join(' · ') || '—'}
                            </td>
                            <td className="py-2 pr-3">
                              {tren.cancelado ? (
                                <Badge variant="destructive">{t('estados.cancelado')}</Badge>
                              ) : (
                                <Badge variant={tren.disponible ? 'exito' : 'secondary'}>
                                  {tren.disponible ? t('estados.hayPlazas') : t('estados.completo')}
                                </Badge>
                              )}
                              {tren.paradasSuprimidas && tren.paradasSuprimidas.length > 0 && (
                                <p className="mt-1 text-xs font-medium text-amber-700 dark:text-amber-300">
                                  {t('detalleAlerta.noParaEn', {
                                    lista: tren.paradasSuprimidas.join(', '),
                                  })}
                                </p>
                              )}
                            </td>
                            <td className="py-2 text-right text-amber-700 dark:text-amber-300">
                              {formatearPrecio(tren.precioMin)}
                              {tren.tarifa && (
                                <p className="text-xs font-normal text-muted-foreground">
                                  {tren.tarifa}
                                </p>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">{mensajeEstadoVacio(alerta, t)}</p>
                )}
              </CardContent>
            </Card>

            {(alerta.criterio === 'DISPONIBILIDAD' ||
              alerta.criterio === 'PRECIO' ||
              seriesPrecios.length > 0) && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Coins className="h-5 w-5 text-primary" aria-hidden="true" />
                    {t('detalleAlerta.precioEvolucion')}
                  </CardTitle>
                  <CardDescription>{t('detalleAlerta.precioEvolucionDesc')}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {seriesPrecios.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      {t('detalleAlerta.precioSinHistorico')}
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {seriesPrecios.map((serie) => {
                        const plana = esSeriePlana(serie.puntos);
                        const { visibles, sondeosOcultos } = recortarContagos(
                          agruparContagos(serie.puntos),
                        );
                        if (plana) {
                          return (
                            <p key={serie.clave} className="text-sm">
                              {textoSerieCompacta(serie)}{' '}
                              <span className="font-medium text-amber-700 dark:text-amber-300">
                                {consejoPrecio(serie.puntos)}
                              </span>
                            </p>
                          );
                        }
                        return (
                          <div key={serie.clave} className="space-y-1">
                            <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                              <span className="font-medium">
                                {horaGtfs(serie.salida)}
                                {serie.numeroTren
                                  ? t('precios.serieTren', { tren: serie.numeroTren })
                                  : ''}
                              </span>
                              <span className="text-xs tabular-nums text-muted-foreground">
                                {formatearPrecio(serie.minimo)} – {formatearPrecio(serie.maximo)}
                              </span>
                            </div>
                            <ul className="space-y-0.5">
                              {visibles.map((grupo, indice) => (
                                <li
                                  key={`${grupo.registradoEn}-${indice}`}
                                  className="flex items-center gap-2"
                                  title={[
                                    new Date(grupo.registradoEn).toLocaleString(locale()),
                                    formatearPrecio(grupo.precioMin),
                                    grupo.cantidad === 1
                                      ? t('detalleAlerta.tooltipSondeo1')
                                      : t('detalleAlerta.tooltipSondeoN', {
                                          n: grupo.cantidad,
                                        }),
                                    grupo.disponible
                                      ? t('detalleAlerta.tooltipDisponible')
                                      : t('detalleAlerta.tooltipCompleto'),
                                  ].join(' · ')}
                                >
                                  <span className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
                                    <span
                                      className="block h-full rounded-full bg-amber-500"
                                      style={{
                                        width: `${anchoBarra(grupo.precioMin, serie.minimo, serie.maximo)}%`,
                                      }}
                                    />
                                  </span>
                                  <span
                                    className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                                      grupo.disponible ? 'bg-emerald-500' : 'bg-gray-400'
                                    }`}
                                    aria-hidden="true"
                                  />
                                  <span className="w-20 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">
                                    {formatearPrecio(grupo.precioMin)}
                                  </span>
                                  <span className="w-7 shrink-0 text-right text-[11px] font-medium tabular-nums text-muted-foreground">
                                    {grupo.cantidad > 1 ? `×${grupo.cantidad}` : ''}
                                  </span>
                                </li>
                              ))}
                            </ul>
                            {sondeosOcultos > 0 ? (
                              <p className="text-[11px] text-muted-foreground">
                                {textoSondeosOcultos(sondeosOcultos)}
                              </p>
                            ) : null}
                            <p className="text-xs font-medium text-amber-700 dark:text-amber-300">
                              {consejoPrecio(serie.puntos)}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {t('detalleAlerta.precioBase', { min: alerta.intervaloSondeoMin })}
                  </p>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">{t('detalleAlerta.avisoTitulo')}</CardTitle>
                <CardDescription>{t('detalleAlerta.avisoDesc')}</CardDescription>
              </CardHeader>
              <CardContent>
                {avisos.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t('detalleAlerta.sinAvisos')}</p>
                ) : (
                  <ul className="divide-y">
                    {avisos.map((aviso) => (
                      <li key={aviso.id} className="space-y-1 py-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="font-medium">{aviso.titulo}</p>
                          {!aviso.leida && (
                            <Badge variant="destructive">{t('detalleAlerta.nuevo')}</Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">{aviso.cuerpo}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(aviso.creadaEn).toLocaleString(locale())}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </>
        )
      )}
    </div>
  );
}
