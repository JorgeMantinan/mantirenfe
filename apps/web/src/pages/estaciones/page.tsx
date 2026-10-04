import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { BellPlus, ExternalLink, Map, MapPin, RefreshCw, Search, TrainFront } from 'lucide-react';
import { api } from '@/lib/api';
import { useBuscadorEstaciones } from '@/hooks/useBuscadorEstaciones';
import { BotonMostrarMas } from '@/components/BotonMostrarMas';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { FILAS_INICIALES_TABLA } from '@/lib/ui-constants';
import { incidenciaAfectaA, type IncidenciaResponse } from '@/lib/incidencias';
import { ListaIncidencias } from '@/components/ListaIncidencias';
import { locale } from '@/i18n';
import {
  horaGtfs,
  type EstacionDetalleResponse,
  type EstacionResponse,
  type HorarioTrenResponse,
} from '@mantirenfe/shared-types';

function hoy(): string {
  return new Date().toISOString().slice(0, 10);
}

function mapaExterno(latitud: number, longitud: number): string {
  return `https://www.openstreetmap.org/?mlat=${latitud}&mlon=${longitud}#map=16/${latitud}/${longitud}`;
}

/** Filas por página del listado general: el scroll infinito va de 20 en 20. */
const PAGINA_ESTACIONES = 20;

/**
 * Fila del listado: el texto abre las salidas de la estación (el botón de
 * «Crear alerta» vive dentro de cada salida, no en la lista de estaciones).
 */
function FilaEstacion({
  estacion,
  onElegir,
}: {
  estacion: EstacionResponse;
  onElegir: (estacion: EstacionResponse) => void;
}) {
  return (
    <li className="flex items-center justify-between gap-2 py-1 pl-3 pr-1">
      <button
        type="button"
        className="min-w-0 flex-1 rounded-sm px-1 py-1.5 text-left text-sm hover:bg-accent"
        onClick={() => onElegir(estacion)}
      >
        <span className="font-medium">{estacion.nombre}</span>
        {estacion.ciudad ? (
          <span className="text-muted-foreground"> · {estacion.ciudad}</span>
        ) : null}
      </button>
    </li>
  );
}

export function PaginaEstaciones() {
  const { t } = useTranslation();
  const [texto, setTexto] = useState('');
  const {
    sugerencias,
    sugerir: buscarEstaciones,
    limpiar: cerrarSugerencias,
  } = useBuscadorEstaciones({ limite: 8 });
  const [sel, setSel] = useState<EstacionResponse | null>(null);
  const [detalle, setDetalle] = useState<EstacionDetalleResponse | null>(null);
  const [detalleListo, setDetalleListo] = useState(false);
  const [salidas, setSalidas] = useState<HorarioTrenResponse[] | null>(null);
  const [cargando, setCargando] = useState(false);
  const [mostrarMas, setMostrarMas] = useState(FILAS_INICIALES_TABLA);
  const [error, setError] = useState<string | null>(null);
  const [incidencias, setIncidencias] = useState<IncidenciaResponse[]>([]);
  const peticionSalidas = useRef(0);
  const peticionDetalle = useRef(0);

  // Listado general (sin `q`): página a página con `offset`, hasta venir corto
  const [listado, setListado] = useState<EstacionResponse[]>([]);
  const [listadoCargando, setListadoCargando] = useState(false);
  const [listadoFin, setListadoFin] = useState(false);
  const [listadoError, setListadoError] = useState(false);
  const offsetListado = useRef(0);
  const cargandoListado = useRef(false);
  const sentinel = useRef<HTMLDivElement | null>(null);

  // Con 2 letras o más manda el desplegable de sugerencias; mientras no haya
  // texto de búsqueda se enseña el listado general paginado.
  const sinBusqueda = texto.trim().length < 2;

  const cargarListado = useCallback((acumular: boolean) => {
    // Serializa las peticiones: si una está en vuelo, la siguiente espera
    if (cargandoListado.current) return;
    cargandoListado.current = true;
    const desde = acumular ? offsetListado.current : 0;
    if (!acumular) {
      setListadoFin(false);
      setListadoError(false);
    }
    setListadoCargando(true);
    api<EstacionResponse[]>(`/estaciones?limite=${PAGINA_ESTACIONES}&offset=${desde}`)
      .then((r) => {
        offsetListado.current = desde + r.length;
        setListadoFin(r.length < PAGINA_ESTACIONES);
        setListado((prev) => (acumular ? [...prev, ...r] : r));
      })
      .catch(() => {
        if (acumular) {
          // Cortamos el scroll: reintentar a ciegas no arreglaría nada
          setListadoFin(true);
        } else {
          setListado([]);
          setListadoError(true);
        }
      })
      .finally(() => {
        cargandoListado.current = false;
        setListadoCargando(false);
      });
  }, []);

  // Carga inicial: 20 estaciones
  useEffect(() => {
    cargarListado(false);
  }, [cargarListado]);

  // Siguiente página cuando el sentinel al final de la lista entra en pantalla
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !sinBusqueda || listadoCargando || listadoFin) return;
    const observador = new IntersectionObserver(
      (entradas) => {
        if (entradas.some((entrada) => entrada.isIntersecting)) cargarListado(true);
      },
      { rootMargin: '240px 0px' },
    );
    observador.observe(el);
    return () => observador.disconnect();
  }, [sinBusqueda, listadoCargando, listadoFin, cargarListado]);

  // El feed de incidencias es independiente: si falla, la página sigue útil
  useEffect(() => {
    api<IncidenciaResponse[]>('/incidencias')
      .then((d) => setIncidencias(d))
      .catch(() => setIncidencias([]));
  }, []);

  const sugerir = (valor: string) => {
    setTexto(valor);
    if (sel && valor !== sel.nombre) {
      setSel(null);
      setDetalle(null);
      setDetalleListo(false);
      setSalidas(null);
      setError(null);
    }
    buscarEstaciones(valor);
  };

  const elegir = (estacion: EstacionResponse) => {
    setTexto(estacion.nombre);
    cerrarSugerencias();
    setDetalle(null);
    setDetalleListo(false);
    setSel(estacion);
  };

  const cargar = useCallback(() => {
    if (!sel) return;
    const id = ++peticionSalidas.current;
    setCargando(true);
    setMostrarMas(FILAS_INICIALES_TABLA);
    setError(null);
    api<HorarioTrenResponse[]>(
      `/trenes/estacion?estacion=${encodeURIComponent(sel.nombre)}&fecha=${hoy()}`,
    )
      .then((d) => {
        if (peticionSalidas.current !== id) return;
        setSalidas(d);
        setError(null);
      })
      .catch((e: Error) => {
        if (peticionSalidas.current !== id) return;
        setSalidas(null);
        setError(e.message);
      })
      .finally(() => {
        if (peticionSalidas.current === id) setCargando(false);
      });
  }, [sel]);

  // Ficha oficial (data.renfe.com): si el CKAN de Renfe falla, seguimos sin
  // ella (dirección, mapa y aforos desaparecen, pero la página no se rompe)
  useEffect(() => {
    if (!sel) {
      setDetalle(null);
      setDetalleListo(false);
      return;
    }
    const id = ++peticionDetalle.current;
    api<EstacionDetalleResponse>(`/estaciones/detalle?codigo=${encodeURIComponent(sel.codigo)}`)
      .then((d) => {
        if (peticionDetalle.current !== id) return;
        setDetalle(d);
        setDetalleListo(true);
      })
      .catch(() => {
        if (peticionDetalle.current !== id) return;
        setDetalle(null);
        setDetalleListo(true);
      });
  }, [sel]);

  useEffect(() => {
    if (sel) cargar();
  }, [sel, cargar]);

  const afectadas = sel
    ? incidencias.filter((incidencia) => incidenciaAfectaA(incidencia, [sel.nombre]))
    : [];

  const latitud = detalle?.latitud ?? sel?.latitud ?? null;
  const longitud = detalle?.longitud ?? sel?.longitud ?? null;
  const urlMapa = latitud != null && longitud != null ? mapaExterno(latitud, longitud) : null;
  const aforos = detalle?.aforos ?? null;

  return (
    <div className="mx-auto max-w-3xl space-y-6 animate-fade-in">
      <div>
        <h1 className="font-heading text-3xl font-bold tracking-tight">{t('menu.estaciones')}</h1>
        <p className="text-muted-foreground">{t('estaciones.subtitulo')}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl">
            <Search className="h-5 w-5 text-primary" aria-hidden="true" />{' '}
            {t('estaciones.buscarTitulo')}
          </CardTitle>
          <CardDescription>{t('estaciones.buscarDescripcion')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="relative space-y-2">
            <Label htmlFor="estacion">{t('estaciones.estacionLabel')}</Label>
            <Input
              id="estacion"
              value={texto}
              onChange={(e) => sugerir(e.target.value)}
              placeholder={t('estaciones.placeholder')}
              autoComplete="off"
            />
            {sugerencias.length > 0 && (
              <ul className="absolute left-0 right-0 top-full z-10 mt-1 rounded-md border bg-popover shadow-md">
                {sugerencias.map((e) => (
                  <li key={e.id} className="flex items-center justify-between gap-2 pr-1">
                    <button
                      type="button"
                      className="min-w-0 flex-1 px-3 py-2 text-left text-sm hover:bg-accent"
                      onClick={() => elegir(e)}
                    >
                      {e.nombre}
                      {e.ciudad ? (
                        <span className="text-muted-foreground"> · {e.ciudad}</span>
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <p className="text-xs text-muted-foreground">{t('estaciones.ayuda')}</p>
          {sinBusqueda && (
            <div className="space-y-2">
              <h2 className="text-sm font-semibold">{t('estaciones.listadoTitulo')}</h2>
              {listadoError ? (
                <p className="text-sm text-destructive">{t('estaciones.listadoError')}</p>
              ) : listado.length > 0 ? (
                <ul className="divide-y rounded-md border">
                  {listado.map((e) => (
                    <FilaEstacion key={e.id} estacion={e} onElegir={elegir} />
                  ))}
                </ul>
              ) : null}
              {listadoCargando ? (
                <p className="text-xs text-muted-foreground">{t('estaciones.listadoCargando')}</p>
              ) : listadoFin && listado.length > 0 ? (
                <p className="text-xs text-muted-foreground">{t('estaciones.listadoFin')}</p>
              ) : null}
              <div ref={sentinel} aria-hidden="true" />
            </div>
          )}
        </CardContent>
      </Card>

      {sel && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl">
                <MapPin className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
                {sel.nombre}
              </CardTitle>
              <CardDescription>
                {t('estaciones.codigo', { codigo: sel.codigo })}
                {sel.ciudad ? ` · ${sel.ciudad}` : ''}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline">
                    {t('estaciones.badgeEstacion', { codigo: sel.codigo })}
                  </Badge>
                  {sel.ciudad ? <Badge variant="secondary">{sel.ciudad}</Badge> : null}
                  <Badge variant={afectadas.length > 0 ? 'aviso' : 'exito'}>
                    {afectadas.length > 0
                      ? afectadas.length === 1
                        ? t('estaciones.incidenciaActiva')
                        : t('estaciones.incidenciasActivas', { n: afectadas.length })
                      : t('estaciones.sinIncidencias')}
                  </Badge>
                </div>
                <Button variant="outline" asChild>
                  <Link to="/mapa">
                    <Map className="h-4 w-4" aria-hidden="true" /> {t('estaciones.verEnMapaBoton')}
                  </Link>
                </Button>
              </div>

              <div className="space-y-3 border-t pt-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1 text-sm">
                    {!detalleListo ? (
                      <p className="text-muted-foreground">{t('estaciones.cargandoOficiales')}</p>
                    ) : detalle ? (
                      <dl className="space-y-1">
                        {detalle.direccion ? (
                          <div className="flex gap-2">
                            <dt className="shrink-0 text-muted-foreground">
                              {t('estaciones.direccion')}
                            </dt>
                            <dd>{detalle.direccion}</dd>
                          </div>
                        ) : null}
                        {detalle.cp ? (
                          <div className="flex gap-2">
                            <dt className="shrink-0 text-muted-foreground">{t('estaciones.cp')}</dt>
                            <dd>{detalle.cp}</dd>
                          </div>
                        ) : null}
                        {detalle.poblacion ? (
                          <div className="flex gap-2">
                            <dt className="shrink-0 text-muted-foreground">
                              {t('estaciones.poblacion')}
                            </dt>
                            <dd>{detalle.poblacion}</dd>
                          </div>
                        ) : null}
                        {detalle.provincia ? (
                          <div className="flex gap-2">
                            <dt className="shrink-0 text-muted-foreground">
                              {t('estaciones.provincia')}
                            </dt>
                            <dd>{detalle.provincia}</dd>
                          </div>
                        ) : null}
                      </dl>
                    ) : null}
                  </div>
                  {urlMapa ? (
                    <Button variant="outline" size="sm" asChild>
                      <a href={urlMapa} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="h-4 w-4" aria-hidden="true" />{' '}
                        {t('estaciones.verEnMapa')}
                      </a>
                    </Button>
                  ) : null}
                </div>

                {aforos && aforos.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-semibold">{t('estaciones.aforoTitulo')}</h3>
                      <Badge variant="outline">{t('estaciones.aforoBadge')}</Badge>
                    </div>
                    <div className="max-h-64 overflow-y-auto rounded-md border">
                      <table className="w-full text-sm">
                        <thead className="sticky top-0 bg-background">
                          <tr className="border-b text-left text-muted-foreground">
                            <th className="py-2 pl-3 pr-3 font-medium">{t('estaciones.franja')}</th>
                            <th className="py-2 pr-3 font-medium text-right">
                              {t('estaciones.viajeros')}
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {aforos.map((aforo) => (
                            <tr
                              key={aforo.franja}
                              className="border-b last:border-b-0 even:bg-muted/40"
                            >
                              <td className="py-1.5 pl-3 pr-3">{aforo.franja}</td>
                              <td className="py-1.5 pr-3 text-right tabular-nums">
                                {(aforo.subidos + aforo.bajados).toLocaleString(locale())}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <p className="text-xs text-muted-foreground">{t('estaciones.aforoNota')}</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {afectadas.map((incidencia) => (
            <ListaIncidencias
              key={incidencia.id}
              incidencias={[incidencia]}
              variante="caja"
              destacada
            />
          ))}

          <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
              <div className="space-y-1.5">
                <CardTitle className="flex items-center gap-2 text-xl">
                  <TrainFront className="h-5 w-5 text-primary" aria-hidden="true" />{' '}
                  {t('estaciones.salidasTitulo')}
                </CardTitle>
                <CardDescription>
                  {new Date(`${hoy()}T12:00:00Z`).toLocaleDateString(locale(), {
                    weekday: 'long',
                    day: 'numeric',
                    month: 'long',
                    timeZone: 'UTC',
                  })}
                  {t('estaciones.salidasDesde', { estacion: sel.nombre })}
                </CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={cargar}
                disabled={cargando}
                aria-label={t('estaciones.actualizarSalidas')}
              >
                <RefreshCw
                  className={`h-4 w-4 ${cargando ? 'animate-spin' : ''}`}
                  aria-hidden="true"
                />
                {t('estaciones.actualizar')}
              </Button>
            </CardHeader>
            <CardContent>
              {cargando ? (
                <div className="space-y-2">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : error ? (
                <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm">
                  {error}
                </div>
              ) : salidas === null || salidas.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  {t('estaciones.sinSalidas')}
                </p>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left text-muted-foreground">
                          <th className="py-2 pr-3 font-medium">{t('tabla.salida')}</th>
                          <th className="py-2 pr-3 font-medium">{t('tabla.destino')}</th>
                          <th className="py-2 pr-3 font-medium">{t('tabla.tren')}</th>
                          <th className="py-2 pr-3 font-medium">{t('tabla.operador')}</th>
                          <th className="py-2 font-medium text-right">
                            {t('estaciones.crearAlertaFila')}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {salidas.slice(0, mostrarMas).map((salida) => (
                          <tr
                            key={`${salida.numeroTren}-${salida.salida}`}
                            className="border-b last:border-b-0"
                          >
                            <td className="py-2 pr-3 font-medium">{horaGtfs(salida.salida)}</td>
                            <td className="py-2 pr-3">{salida.destinoNombre}</td>
                            <td className="py-2 pr-3">
                              <Badge variant="outline">{salida.numeroTren}</Badge>
                            </td>
                            <td className="py-2 pr-3">
                              {salida.operador ?? <span className="text-muted-foreground">—</span>}
                            </td>
                            <td className="py-2 pr-3 text-right">{salida.duracionMin} min</td>
                            <td className="py-2 text-right">
                              {sel && salida.destinoNombre !== sel.nombre ? (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  asChild
                                  className="text-muted-foreground"
                                >
                                  <Link
                                    to={
                                      `/alertas/nueva?origen=${encodeURIComponent(sel.nombre)}` +
                                      `&destino=${encodeURIComponent(salida.destinoNombre)}` +
                                      `&fecha=${hoy()}&numeroTren=${encodeURIComponent(salida.numeroTren)}`
                                    }
                                  >
                                    <BellPlus className="h-4 w-4" aria-hidden="true" />
                                    <span className="sr-only">
                                      {t('estaciones.crearAlertaFila')}
                                    </span>
                                  </Link>
                                </Button>
                              ) : null}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <BotonMostrarMas
                    total={salidas.length}
                    visible={mostrarMas}
                    onAmpliar={setMostrarMas}
                  />
                </>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
