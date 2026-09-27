import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, BellRing, Coins, RefreshCw, Train, TriangleAlert } from 'lucide-react';
import { api } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatoPeriodo, incidenciaAfectaA, type IncidenciaResponse } from '@/lib/incidencias';
import {
  agruparPrecios,
  anchoBarra,
  consejoPrecio,
  formatearPrecio,
  MAX_PUNTOS_GRAFICA,
} from '@/lib/precios';
import {
  horaGtfs,
  type AlertaResponse,
  type EstadoSerializado,
  type NotificacionResponse,
  type PuntoPrecio,
} from '@mantirenfe/shared-types';

/** "hace X min" si es reciente; si no, fecha legible en español. */
function haceCuanto(iso: string): string {
  const minutos = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutos < 1) return 'hace un momento';
  if (minutos < 60) return `hace ${minutos} min`;
  return new Date(iso).toLocaleString('es-ES');
}

export function PaginaDetalleAlerta() {
  const { id } = useParams<{ id: string }>();
  const [alerta, setAlerta] = useState<AlertaResponse | null>(null);
  const [avisos, setAvisos] = useState<NotificacionResponse[]>([]);
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
      api<NotificacionResponse[]>('/notificaciones'),
      // Si el feed de incidencias no responde, el detalle se muestra igual
      api<IncidenciaResponse[]>('/incidencias').catch(() => [] as IncidenciaResponse[]),
      // Histórico de precios: solo existe para alertas de disponibilidad
      api<PuntoPrecio[]>(`/alertas/${id}/precios`).catch(() => [] as PuntoPrecio[]),
    ])
      .then(([a, todas, incidenciasActivas, historial]) => {
        setAlerta(a);
        setPrecios(historial);
        setIncidencias(
          incidenciasActivas.filter((inc) =>
            incidenciaAfectaA(inc, [a.origenNombre, a.destinoNombre]),
          ),
        );
        const deEstaAlerta = todas.filter((n) => n.alertaId === id);
        setAvisos(deEstaAlerta);
        // Al abrir el detalle se marcan como leídos los avisos de esta alerta
        const sinLeer = deEstaAlerta.filter((n) => !n.leida).map((n) => n.id);
        if (sinLeer.length > 0) {
          void api('/notificaciones/marcar-leidas', { method: 'PATCH', json: { ids: sinLeer } })
            .then(() => setAvisos(deEstaAlerta.map((n) => ({ ...n, leida: true }))))
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

  return (
    <div className="mx-auto max-w-2xl space-y-4 animate-fade-in">
      <div className="space-y-1">
        <Button variant="ghost" size="sm" asChild className="-ml-2">
          <Link to="/alertas">
            <ArrowLeft aria-hidden="true" /> Volver a mis alertas
          </Link>
        </Button>
        <h1 className="font-heading text-3xl font-bold tracking-tight">Detalle de la alerta</h1>
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
            {incidencias.length > 0 && (
              <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-4 text-sm">
                <p className="flex items-center gap-2 font-semibold text-amber-700 dark:text-amber-300">
                  <TriangleAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
                  Incidencia de servicio que puede afectar a esta ruta
                </p>
                <ul className="mt-2 space-y-3">
                  {incidencias.map((incidencia) => (
                    <li key={incidencia.id} className="space-y-1">
                      <p className="font-medium">{incidencia.titulo ?? 'Incidencia de servicio'}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatoPeriodo(incidencia.desde, incidencia.hasta)}
                      </p>
                      {incidencia.estacionesAfectadas.length > 0 && (
                        <p className="text-xs text-muted-foreground">
                          Estaciones: {incidencia.estacionesAfectadas.join(', ')}
                        </p>
                      )}
                      {incidencia.mensaje && (
                        <p className="text-muted-foreground">{incidencia.mensaje}</p>
                      )}
                    </li>
                  ))}
                </ul>
                <Link to="/incidencias" className="mt-2 inline-block font-medium underline">
                  Ver todas las incidencias
                </Link>
              </div>
            )}

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-xl">
                  <BellRing className="h-5 w-5 text-primary" aria-hidden="true" />
                  {alerta.origenNombre} → {alerta.destinoNombre}
                </CardTitle>
                <CardDescription>
                  {alerta.fechaViaje} ·{' '}
                  {alerta.horaDesde || alerta.horaHasta
                    ? `${alerta.horaDesde ?? '00:00'} – ${alerta.horaHasta ?? '23:59'}`
                    : 'todo el día'}
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
                    ? 'Activa'
                    : alerta.estado === 'PAUSA'
                      ? 'En pausa'
                      : 'Completada'}
                </Badge>
                <Badge variant="outline">{alerta.criterio}</Badge>
                {alerta.recurrente && (
                  <Badge variant="aviso">
                    {alerta.soloLaborables ? 'L-V: Cada día laborable' : 'Cada día'}
                  </Badge>
                )}
                <Badge variant="outline">cada {alerta.intervaloSondeoMin} min</Badge>
                <Badge variant="outline">{alerta.bono}</Badge>
                {alerta.numeroTren && <Badge variant="outline">tren {alerta.numeroTren}</Badge>}
                <span className="text-muted-foreground">
                  Último sondeo:{' '}
                  {alerta.ultimoSondeoEn
                    ? new Date(alerta.ultimoSondeoEn).toLocaleString('es-ES')
                    : 'ninguno'}
                </span>
              </CardContent>
              {alerta.notas && (
                <CardContent className="pt-0 text-sm text-muted-foreground">
                  Notas: {alerta.notas}
                </CardContent>
              )}
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
                <div className="space-y-1.5">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Train className="h-5 w-5 text-primary" aria-hidden="true" />
                    Plazas de hoy
                  </CardTitle>
                  <CardDescription>
                    {alerta.ultimoSondeoEn
                      ? `Último sondeo: ${haceCuanto(alerta.ultimoSondeoEn)}`
                      : 'Todavía no se ha sondeado esta alerta'}
                  </CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={cargar} disabled={cargando}>
                  <RefreshCw aria-hidden="true" /> Actualizar
                </Button>
              </CardHeader>
              <CardContent>
                {trenes.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left text-muted-foreground">
                          <th className="py-2 pr-3 font-medium">Hora</th>
                          <th className="py-2 pr-3 font-medium">Tren</th>
                          <th className="py-2 pr-3 font-medium">Plazas</th>
                          <th className="py-2 font-medium text-right">Precio desde</th>
                        </tr>
                      </thead>
                      <tbody>
                        {trenes.map((tren) => (
                          <tr
                            key={`${tren.trenId}-${tren.salida}`}
                            className="border-b last:border-b-0"
                          >
                            <td className="py-2 pr-3 font-medium">{horaGtfs(tren.salida)}</td>
                            <td className="py-2 pr-3">{tren.numeroTren || '—'}</td>
                            <td className="py-2 pr-3">
                              <Badge variant={tren.disponible ? 'exito' : 'secondary'}>
                                {tren.disponible ? 'Hay plazas' : 'Completo'}
                              </Badge>
                            </td>
                            <td className="py-2 text-right text-amber-700 dark:text-amber-300">
                              {formatearPrecio(tren.precioMin)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {alerta.criterio === 'DISPONIBILIDAD' || alerta.criterio === 'APERTURA_VENTA'
                      ? `Aún no hay datos de plazas — se consulta cada ${alerta.intervaloSondeoMin} min`
                      : 'Solo para alertas de disponibilidad'}
                  </p>
                )}
              </CardContent>
            </Card>

            {(alerta.criterio === 'DISPONIBILIDAD' || seriesPrecios.length > 0) && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Coins className="h-5 w-5 text-primary" aria-hidden="true" />
                    Evolución de precio
                  </CardTitle>
                  <CardDescription>
                    ¿Compro ahora o espero? Puntos registrados en cada sondeo
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  {seriesPrecios.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Todavía no hay histórico de precios — se apunta cuando cambia el precio o
                      aparecen plazas.
                    </p>
                  ) : (
                    <div className="space-y-5">
                      {seriesPrecios.map((serie) => (
                        <div key={serie.clave} className="space-y-2">
                          <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                            <span className="font-medium">
                              {horaGtfs(serie.salida)}
                              {serie.numeroTren ? ` · tren ${serie.numeroTren}` : ''}
                            </span>
                            <span className="text-xs tabular-nums text-muted-foreground">
                              {formatearPrecio(serie.minimo)} – {formatearPrecio(serie.maximo)}
                            </span>
                          </div>
                          <ul className="space-y-1">
                            {serie.puntos.slice(-MAX_PUNTOS_GRAFICA).map((punto, indice) => (
                              <li
                                key={`${punto.registradoEn}-${indice}`}
                                className="flex items-center gap-2"
                                title={`${new Date(punto.registradoEn).toLocaleString('es-ES')} · ${formatearPrecio(punto.precioMin)} · ${punto.disponible ? 'disponible' : 'completo'}`}
                              >
                                <span className="h-2.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
                                  <span
                                    className="block h-full rounded-full bg-amber-500"
                                    style={{
                                      width: `${anchoBarra(punto.precioMin, serie.minimo, serie.maximo)}%`,
                                    }}
                                  />
                                </span>
                                <span
                                  className={`h-2 w-2 shrink-0 rounded-full ${
                                    punto.disponible ? 'bg-emerald-500' : 'bg-gray-400'
                                  }`}
                                  aria-hidden="true"
                                />
                                <span className="w-20 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">
                                  {formatearPrecio(punto.precioMin)}
                                </span>
                              </li>
                            ))}
                          </ul>
                          <p className="text-xs font-medium text-amber-700 dark:text-amber-300">
                            {consejoPrecio(serie.puntos)}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Basado en nuestros sondeos cada {alerta.intervaloSondeoMin} min; precio
                    orientativo de venta
                  </p>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Avisos de esta alerta</CardTitle>
                <CardDescription>Historial de notificaciones que hemos enviado</CardDescription>
              </CardHeader>
              <CardContent>
                {avisos.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Todavía no hemos enviado avisos para esta alerta.
                  </p>
                ) : (
                  <ul className="divide-y">
                    {avisos.map((aviso) => (
                      <li key={aviso.id} className="space-y-1 py-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="font-medium">{aviso.titulo}</p>
                          {!aviso.leida && <Badge variant="destructive">Nuevo</Badge>}
                        </div>
                        <p className="text-sm text-muted-foreground">{aviso.cuerpo}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(aviso.creadaEn).toLocaleString('es-ES')}
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
