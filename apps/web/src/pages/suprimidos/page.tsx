import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Trans, useTranslation } from 'react-i18next';
import { CircleSlash, Search } from 'lucide-react';
import { api } from '@/lib/api';
import { useBuscadorEstaciones } from '@/hooks/useBuscadorEstaciones';
import { useMetaPagina } from '@/hooks/useMetaPagina';
import { Badge } from '@/components/ui/badge';
import { BotonMostrarMas } from '@/components/BotonMostrarMas';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { FILAS_INICIALES_TABLA } from '@/lib/ui-constants';
import { fechaGtfs, type SuprimidoResponse } from '@mantirenfe/shared-types';

/** Días de histórico que conserva la API (el worker poda a los 7). */
const DIAS_HISTORICO = 7;

/** Día más antiguo consultable: antes de eso el worker ya ha podado la fila. */
function fechaMinima(): string {
  const partes = fechaGtfs().split('-').map(Number);
  const anio = partes[0] ?? 1970;
  const mes = partes[1] ?? 1;
  const dia = partes[2] ?? 1;
  return new Date(Date.UTC(anio, mes - 1, dia - DIAS_HISTORICO)).toISOString().slice(0, 10);
}

function sinDatos(fila: SuprimidoResponse): boolean {
  return !fila.origen || !fila.destino || !fila.salida || !fila.llegada;
}

export function PaginaSuprimidos() {
  useMetaPagina('/suprimidos');
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [texto, setTexto] = useState('');
  const [estacion, setEstacion] = useState('');
  const [fecha, setFecha] = useState(fechaGtfs);
  const {
    sugerencias,
    sugerir: buscarEstaciones,
    limpiar: cerrarSugerencias,
  } = useBuscadorEstaciones({ limite: 5 });
  const [datos, setDatos] = useState<SuprimidoResponse[] | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mostrarMas, setMostrarMas] = useState(FILAS_INICIALES_TABLA);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    // Cada consulta empieza con la tabla al tope: los filtros cambian el listado
    setMostrarMas(FILAS_INICIALES_TABLA);
    try {
      const params = new URLSearchParams({ fecha });
      if (estacion.trim()) params.set('estacion', estacion.trim());
      const respuesta = await api<SuprimidoResponse[]>(`/suprimidos?${params.toString()}`);
      setDatos(respuesta);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('suprimidos.error'));
      setDatos(null);
    } finally {
      setCargando(false);
    }
  }, [fecha, estacion, t]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const buscar = (evento: FormEvent) => {
    evento.preventDefault();
    cerrarSugerencias();
    setEstacion(texto.trim());
  };

  const quitarEstacion = () => {
    setTexto('');
    cerrarSugerencias();
    setEstacion('');
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6 animate-fade-in">
      <div>
        <h1 className="font-heading text-3xl font-bold tracking-tight">{t('suprimidos.titulo')}</h1>
        <p className="text-muted-foreground">{t('suprimidos.subtitulo')}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl">
            <CircleSlash className="h-5 w-5 text-primary" aria-hidden="true" />{' '}
            {t('suprimidos.consultar')}
          </CardTitle>
          <CardDescription>
            {t('suprimidos.consultarDescripcion', { dias: DIAS_HISTORICO })}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={buscar} className="grid gap-4 sm:grid-cols-3">
            <div className="relative space-y-2 sm:col-span-2">
              <Label htmlFor="estacion">{t('suprimidos.estacionLabel')}</Label>
              <Input
                id="estacion"
                value={texto}
                onChange={(e) => {
                  setTexto(e.target.value);
                  buscarEstaciones(e.target.value);
                }}
                placeholder="Madrid-Atocha"
                autoComplete="off"
              />
              {sugerencias.length > 0 && (
                <ul className="absolute left-0 right-0 top-full z-10 mt-1 rounded-md border bg-popover shadow-md">
                  {sugerencias.map((e) => (
                    <li key={e.id}>
                      <button
                        type="button"
                        className="w-full px-3 py-2 text-left text-sm hover:bg-accent"
                        onClick={() => {
                          setTexto(e.nombre);
                          cerrarSugerencias();
                          setEstacion(e.nombre);
                        }}
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
            <div className="space-y-2">
              <Label htmlFor="fecha">{t('suprimidos.fechaLabel')}</Label>
              <Input
                id="fecha"
                type="date"
                value={fecha}
                min={fechaMinima()}
                max={fechaGtfs()}
                onChange={(e) => setFecha(e.target.value || fechaGtfs())}
              />
            </div>
            <div className="flex flex-wrap items-center gap-2 sm:col-span-3">
              <Button type="submit" disabled={cargando}>
                <Search className="h-4 w-4" aria-hidden="true" /> {t('suprimidos.buscar')}
              </Button>
              {estacion ? (
                <Button type="button" variant="outline" size="sm" onClick={quitarEstacion}>
                  {t('suprimidos.quitarFiltro', { estacion })}
                </Button>
              ) : null}
            </div>
          </form>
        </CardContent>
      </Card>

      {error ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm">
          {error}
        </div>
      ) : null}

      {cargando ? (
        <div className="space-y-2">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : null}

      {!cargando && datos !== null ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">{t('suprimidos.resultados')}</CardTitle>
            <CardDescription>
              {datos.length > 0
                ? estacion
                  ? t('suprimidos.resultadosDescEstacion', {
                      trenes: datos.length,
                      fecha,
                      estacion,
                    })
                  : t('suprimidos.resultadosDesc', { trenes: datos.length, fecha })
                : t('suprimidos.sinTrenes')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {datos.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-8 text-center">
                <CircleSlash className="h-10 w-10 text-muted-foreground/50" aria-hidden="true" />
                <p className="text-sm text-muted-foreground">
                  <Trans
                    i18nKey={
                      estacion ? 'suprimidos.nadaReportarEstacion' : 'suprimidos.nadaReportar'
                    }
                    values={{ fecha, estacion }}
                    components={{ strong: <strong /> }}
                  />
                </p>
                <p className="max-w-md text-xs text-muted-foreground">
                  {t('suprimidos.notaAntes')}
                  <button
                    type="button"
                    className="underline"
                    onClick={() => navigate('/incidencias')}
                  >
                    {t('suprimidos.notaBoton')}
                  </button>
                  {t('suprimidos.notaDespues')}
                </p>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="py-2 pr-3 font-medium">{t('suprimidos.colTren')}</th>
                        <th className="py-2 pr-3 font-medium">
                          {t('suprimidos.colOrigenDestino')}
                        </th>
                        <th className="py-2 pr-3 font-medium">{t('suprimidos.colSalida')}</th>
                        <th className="py-2 pr-3 font-medium">{t('suprimidos.colLlegada')}</th>
                        <th className="py-2 font-medium text-right">{t('suprimidos.colDatos')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {datos.slice(0, mostrarMas).map((fila) => (
                        <tr key={fila.tripId} className="border-b last:border-b-0">
                          <td className="py-2 pr-3 font-medium">
                            {fila.numeroTren ?? (
                              <span className="font-normal text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="py-2 pr-3">
                            {fila.origen && fila.destino ? (
                              <>
                                {fila.origen} → {fila.destino}
                              </>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="py-2 pr-3">{fila.salida ?? '—'}</td>
                          <td className="py-2 pr-3">{fila.llegada ?? '—'}</td>
                          <td className="py-2 text-right">
                            {sinDatos(fila) ? (
                              <Badge variant="aviso">{t('suprimidos.sinDatos')}</Badge>
                            ) : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <BotonMostrarMas
                  total={datos.length}
                  visible={mostrarMas}
                  onAmpliar={setMostrarMas}
                />
              </>
            )}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
