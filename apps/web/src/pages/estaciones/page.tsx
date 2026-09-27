import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ExternalLink,
  Map,
  MapPin,
  RefreshCw,
  Search,
  TrainFront,
  TriangleAlert,
} from 'lucide-react';
import { api } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { formatoPeriodo, incidenciaAfectaA, type IncidenciaResponse } from '@/lib/incidencias';
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

export function PaginaEstaciones() {
  const [texto, setTexto] = useState('');
  const [sugerencias, setSugerencias] = useState<EstacionResponse[]>([]);
  const [sel, setSel] = useState<EstacionResponse | null>(null);
  const [detalle, setDetalle] = useState<EstacionDetalleResponse | null>(null);
  const [detalleListo, setDetalleListo] = useState(false);
  const [salidas, setSalidas] = useState<HorarioTrenResponse[] | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [incidencias, setIncidencias] = useState<IncidenciaResponse[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const peticion = useRef(0);
  const peticionSalidas = useRef(0);
  const peticionDetalle = useRef(0);

  useEffect(
    () => () => {
      clearTimeout(timer.current);
    },
    [],
  );

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
    clearTimeout(timer.current);
    if (valor.trim().length < 2) {
      setSugerencias([]);
      return;
    }
    timer.current = setTimeout(() => {
      const id = ++peticion.current;
      api<EstacionResponse[]>(`/estaciones?q=${encodeURIComponent(valor.trim())}&limite=8`)
        .then((r) => {
          if (peticion.current === id) setSugerencias(r);
        })
        .catch(() => {
          if (peticion.current === id) setSugerencias([]);
        });
    }, 250);
  };

  const elegir = (estacion: EstacionResponse) => {
    setTexto(estacion.nombre);
    setSugerencias([]);
    setDetalle(null);
    setDetalleListo(false);
    setSel(estacion);
  };

  const cargar = useCallback(() => {
    if (!sel) return;
    const id = ++peticionSalidas.current;
    setCargando(true);
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
        <h1 className="font-heading text-3xl font-bold tracking-tight">Estaciones</h1>
        <p className="text-muted-foreground">
          Busca por nombre o por ciudad/zona —prueba «Vigo»— para ver las salidas de hoy, las
          incidencias que afectan a esa estación y su situación en el mapa.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl">
            <Search className="h-5 w-5 text-primary" aria-hidden="true" /> Buscar estación
          </CardTitle>
          <CardDescription>
            El buscador tolera tildes y abreviaturas: con «Vigo» aparecen todas las estaciones de la
            ciudad.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="relative space-y-2">
            <Label htmlFor="estacion">Estación</Label>
            <Input
              id="estacion"
              value={texto}
              onChange={(e) => sugerir(e.target.value)}
              placeholder="Vigo-Guixar, Madrid-Atocha, Valencia..."
              autoComplete="off"
            />
            {sugerencias.length > 0 && (
              <ul className="absolute left-0 right-0 top-full z-10 mt-1 rounded-md border bg-popover shadow-md">
                {sugerencias.map((e) => (
                  <li key={e.id}>
                    <button
                      type="button"
                      className="w-full px-3 py-2 text-left text-sm hover:bg-accent"
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
          <p className="text-xs text-muted-foreground">
            Escribe al menos 2 letras. Si no la encuentras, prueba con la ciudad, la comarca o la
            provincia.
          </p>
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
                Código {sel.codigo}
                {sel.ciudad ? ` · ${sel.ciudad}` : ''}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline">Estación {sel.codigo}</Badge>
                  {sel.ciudad ? <Badge variant="secondary">{sel.ciudad}</Badge> : null}
                  <Badge variant={afectadas.length > 0 ? 'aviso' : 'exito'}>
                    {afectadas.length > 0
                      ? `${afectadas.length} incidencia${afectadas.length > 1 ? 's' : ''} activa${
                          afectadas.length > 1 ? 's' : ''
                        }`
                      : 'Sin incidencias'}
                  </Badge>
                </div>
                <Button variant="outline" asChild>
                  <Link to="/mapa">
                    <Map className="h-4 w-4" aria-hidden="true" /> Ver en el mapa
                  </Link>
                </Button>
              </div>

              <div className="space-y-3 border-t pt-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1 text-sm">
                    {!detalleListo ? (
                      <p className="text-muted-foreground">Cargando datos oficiales...</p>
                    ) : detalle ? (
                      <dl className="space-y-1">
                        {detalle.direccion ? (
                          <div className="flex gap-2">
                            <dt className="shrink-0 text-muted-foreground">Dirección</dt>
                            <dd>{detalle.direccion}</dd>
                          </div>
                        ) : null}
                        {detalle.cp ? (
                          <div className="flex gap-2">
                            <dt className="shrink-0 text-muted-foreground">CP</dt>
                            <dd>{detalle.cp}</dd>
                          </div>
                        ) : null}
                        {detalle.poblacion ? (
                          <div className="flex gap-2">
                            <dt className="shrink-0 text-muted-foreground">Población</dt>
                            <dd>{detalle.poblacion}</dd>
                          </div>
                        ) : null}
                        {detalle.provincia ? (
                          <div className="flex gap-2">
                            <dt className="shrink-0 text-muted-foreground">Provincia</dt>
                            <dd>{detalle.provincia}</dd>
                          </div>
                        ) : null}
                      </dl>
                    ) : null}
                  </div>
                  {urlMapa ? (
                    <Button variant="outline" size="sm" asChild>
                      <a href={urlMapa} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="h-4 w-4" aria-hidden="true" /> Ver en mapa
                      </a>
                    </Button>
                  ) : null}
                </div>

                {aforos && aforos.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-semibold">Datos históricos de aforo (2018)</h3>
                      <Badge variant="outline">histórico 2018</Badge>
                    </div>
                    <div className="max-h-64 overflow-y-auto rounded-md border">
                      <table className="w-full text-sm">
                        <thead className="sticky top-0 bg-background">
                          <tr className="border-b text-left text-muted-foreground">
                            <th className="py-2 pl-3 pr-3 font-medium">Franja</th>
                            <th className="py-2 pr-3 font-medium text-right">Viajeros</th>
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
                                {(aforo.subidos + aforo.bajados).toLocaleString('es-ES')}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Viajeros subidos y bajados por franja horaria — fuente: data.renfe.com
                      («Volumen de Viajeros por Franja Horaria», 2018).
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {afectadas.map((incidencia) => (
            <div
              key={incidencia.id}
              className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-4 text-sm"
            >
              <p className="flex items-center gap-2 font-semibold text-amber-700 dark:text-amber-300">
                <TriangleAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
                {incidencia.titulo ?? 'Incidencia de servicio'}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {formatoPeriodo(incidencia.desde, incidencia.hasta)}
              </p>
              {incidencia.mensaje && <p className="mt-2">{incidencia.mensaje}</p>}
              {incidencia.estacionesAfectadas.length > 0 && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Estaciones: {incidencia.estacionesAfectadas.join(', ')}
                </p>
              )}
            </div>
          ))}

          <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
              <div className="space-y-1.5">
                <CardTitle className="flex items-center gap-2 text-xl">
                  <TrainFront className="h-5 w-5 text-primary" aria-hidden="true" /> Salidas de hoy
                </CardTitle>
                <CardDescription>
                  {new Date(`${hoy()}T12:00:00Z`).toLocaleDateString('es-ES', {
                    weekday: 'long',
                    day: 'numeric',
                    month: 'long',
                    timeZone: 'UTC',
                  })}
                  {' · salidas programadas desde '}
                  {sel.nombre}
                </CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={cargar}
                disabled={cargando}
                aria-label="Actualizar salidas"
              >
                <RefreshCw
                  className={`h-4 w-4 ${cargando ? 'animate-spin' : ''}`}
                  aria-hidden="true"
                />
                Actualizar
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
                <p className="py-8 text-center text-sm text-muted-foreground">Sin salidas hoy</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="py-2 pr-3 font-medium">Salida</th>
                        <th className="py-2 pr-3 font-medium">Destino</th>
                        <th className="py-2 pr-3 font-medium">Tren</th>
                        <th className="py-2 pr-3 font-medium">Operador</th>
                        <th className="py-2 font-medium text-right">Duración</th>
                      </tr>
                    </thead>
                    <tbody>
                      {salidas.map((t) => (
                        <tr
                          key={`${t.numeroTren}-${t.salida}`}
                          className="border-b last:border-b-0"
                        >
                          <td className="py-2 pr-3 font-medium">{horaGtfs(t.salida)}</td>
                          <td className="py-2 pr-3">{t.destinoNombre}</td>
                          <td className="py-2 pr-3">
                            <Badge variant="outline">{t.numeroTren}</Badge>
                          </td>
                          <td className="py-2 pr-3">
                            {t.operador ?? <span className="text-muted-foreground">—</span>}
                          </td>
                          <td className="py-2 text-right">{t.duracionMin} min</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
