import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CalendarClock } from 'lucide-react';
import { useMetaPagina } from '@/hooks/useMetaPagina';
import { api } from '@/lib/api';
import { BotonMostrarMas } from '@/components/BotonMostrarMas';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { locale } from '@/i18n';
import type { PuntualidadTrenResponse } from '@mantirenfe/shared-types';

function mesActual(): string {
  return new Date().toISOString().slice(0, 7);
}

function formatMinutos(segundos: number): string {
  if (segundos < 60) return `${segundos} s`;
  return `${Math.round(segundos / 60)} min`;
}

/** Columnas ordenables de la tabla (el resto, como el «#», no). */
type Columna =
  'tren' | 'trayecto' | 'salida' | 'llegada' | 'llegadaEstimada' | 'servicios' | 'medio' | 'peor';

type OrdenColumna = { col: Columna; dir: 'asc' | 'desc' };

/** Comparador por columna: texto (locale) o número, en la dirección pedida. */
function comparar(
  fa: PuntualidadTrenResponse,
  fb: PuntualidadTrenResponse,
  orden: OrdenColumna,
): number {
  const dir = orden.dir === 'asc' ? 1 : -1;
  switch (orden.col) {
    case 'tren':
      return (
        (fa.numeroTren ?? fa.vehiculoId).localeCompare(fb.numeroTren ?? fb.vehiculoId, locale()) *
        dir
      );
    case 'trayecto':
      return (
        `${fa.origenNombre ?? ''} ${fa.destinoNombre ?? ''}`.localeCompare(
          `${fb.origenNombre ?? ''} ${fb.destinoNombre ?? ''}`,
          locale(),
        ) * dir
      );
    case 'salida':
      return (fa.salida ?? '').localeCompare(fb.salida ?? '') * dir;
    case 'llegada':
      return (fa.llegada ?? '').localeCompare(fb.llegada ?? '') * dir;
    case 'llegadaEstimada':
      return (fa.llegadaEstimada ?? '').localeCompare(fb.llegadaEstimada ?? '') * dir;
    case 'servicios':
      return (fa.vecesImpuntuales - fb.vecesImpuntuales) * dir;
    case 'medio':
      return (fa.retrasoMedioSeg - fb.retrasoMedioSeg) * dir;
    case 'peor':
      return (fa.retrasoMaxSeg - fb.retrasoMaxSeg) * dir;
  }
}

export function PaginaPuntualidad() {
  useMetaPagina('/puntualidad');
  const { t } = useTranslation();
  const [mes, setMes] = useState(mesActual);
  const [orden, setOrden] = useState<'veces' | 'impuntualidad'>('veces');
  const [q, setQ] = useState('');
  const [qDebounced, setQDebounced] = useState('');
  const [ordenCol, setOrdenCol] = useState<OrdenColumna | null>(null);
  const [datos, setDatos] = useState<PuntualidadTrenResponse[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mostrarMas, setMostrarMas] = useState(20);

  // Debounce del buscador: la API devuelve como mucho un límite de filas
  useEffect(() => {
    const id = setTimeout(() => setQDebounced(q.trim()), 300);
    return () => clearTimeout(id);
  }, [q]);

  const cargar = useCallback(() => {
    setDatos(null);
    setMostrarMas(20);
    const limite = qDebounced ? 100 : 20;
    api<PuntualidadTrenResponse[]>(
      `/trenes/puntualidad?mes=${mes}&orden=${orden}&limite=${limite}&q=${encodeURIComponent(qDebounced)}`,
    )
      .then((d) => {
        setDatos(d);
        setError(null);
      })
      .catch((e: unknown) => {
        setError(e instanceof Error && e.message ? e.message : t('comunes.error'));
        setDatos([]);
      });
  }, [mes, orden, qDebounced, t]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const datosVista = useMemo(() => {
    const arr = datos ?? [];
    if (!ordenCol) return arr;
    return [...arr].sort((fa, fb) => comparar(fa, fb, ordenCol));
  }, [datos, ordenCol]);

  const alternarOrden = (col: Columna) => {
    // Primer clic: números de mayor a menor; texto, de la A a la Z
    const numerica = col === 'servicios' || col === 'medio' || col === 'peor';
    if (ordenCol?.col === col) {
      setOrdenCol({ col, dir: ordenCol.dir === 'desc' ? 'asc' : 'desc' });
    } else {
      setOrdenCol({ col, dir: numerica ? 'desc' : 'asc' });
    }
  };

  const reiniciar = () => {
    setQ('');
    setQDebounced('');
    setOrdenCol(null);
  };

  const Cabecera = ({
    col,
    children,
    derecha = false,
  }: {
    col: Columna;
    children: string;
    derecha?: boolean;
  }) => (
    <th className={`py-2 pr-3 font-medium${derecha ? ' text-right' : ''}`}>
      <button
        type="button"
        onClick={() => alternarOrden(col)}
        className={`inline-flex items-center gap-1 hover:text-foreground ${ordenCol?.col === col ? 'text-foreground' : ''}`}
        aria-label={t('puntualidad.ordenarPor', { columna: children })}
      >
        {children}
        {ordenCol?.col === col ? (
          <span aria-hidden="true">{ordenCol.dir === 'desc' ? '▼' : '▲'}</span>
        ) : null}
      </button>
    </th>
  );

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-3xl font-bold tracking-tight">
            {t('puntualidad.titulo')}
          </h1>
          <p className="text-muted-foreground">{t('puntualidad.subtitulo')}</p>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <CalendarClock aria-hidden="true" className="h-4 w-4" />
          <span className="sr-only">{t('puntualidad.mes')}</span>
          <input
            type="month"
            value={mes}
            max={mesActual()}
            onChange={(e) => setMes(e.target.value || mesActual())}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
          />
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant={orden === 'veces' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setOrden('veces')}
        >
          {t('puntualidad.ordenVeces')}
        </Button>
        <Button
          variant={orden === 'impuntualidad' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setOrden('impuntualidad')}
        >
          {t('puntualidad.ordenMedia')}
        </Button>
        {ordenCol || q ? (
          <Button variant="ghost" size="sm" onClick={reiniciar}>
            {t('puntualidad.reiniciar')}
          </Button>
        ) : null}
      </div>

      <Input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={t('puntualidad.buscador')}
        aria-label={t('puntualidad.buscador')}
        className="max-w-sm"
      />

      {error ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm">
          {error}
        </div>
      ) : null}

      {datos === null ? (
        <div className="space-y-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : datos.length === 0 ? (
        <Card>
          <CardContent className="py-14 text-center text-sm text-muted-foreground">
            {t('puntualidad.vacio')}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">
              {new Date(`${mes}-02T00:00:00Z`).toLocaleDateString(locale(), {
                month: 'long',
                year: 'numeric',
                timeZone: 'UTC',
              })}
            </CardTitle>
            <CardDescription>
              {qDebounced
                ? t('puntualidad.busquedaDesc', { n: datos.length, q: qDebounced })
                : t('puntualidad.top20', { n: datos.length })}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">#</th>
                    <Cabecera col="tren">{t('puntualidad.colTren')}</Cabecera>
                    <Cabecera col="trayecto">{t('puntualidad.colTrayecto')}</Cabecera>
                    <Cabecera col="salida">{t('puntualidad.colSalida')}</Cabecera>
                    <Cabecera col="llegada">{t('puntualidad.colLlegada')}</Cabecera>
                    <Cabecera col="llegadaEstimada">{t('puntualidad.colLlegadaEstimada')}</Cabecera>
                    <Cabecera col="servicios" derecha>
                      {t('puntualidad.colServicios')}
                    </Cabecera>
                    <Cabecera col="medio" derecha>
                      {t('puntualidad.colRetrasoMedio')}
                    </Cabecera>
                    <Cabecera col="peor" derecha>
                      {t('puntualidad.colPeorRetraso')}
                    </Cabecera>
                  </tr>
                </thead>
                <tbody>
                  {datosVista.slice(0, mostrarMas).map((f, i) => (
                    <tr key={f.clave ?? f.vehiculoId} className="border-b last:border-b-0">
                      <td className="py-2 pr-3 text-muted-foreground">{i + 1}</td>
                      <td className="py-2 pr-3 font-medium">{f.numeroTren ?? f.vehiculoId}</td>
                      <td className="py-2 pr-3">
                        {f.origenNombre && f.destinoNombre ? (
                          <>
                            {f.origenNombre} → {f.destinoNombre}
                          </>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="py-2 pr-3">{f.salida ?? '—'}</td>
                      <td className="py-2 pr-3">{f.llegada ?? '—'}</td>
                      <td className="py-2 pr-3">{f.llegadaEstimada ?? '—'}</td>
                      <td className="py-2 pr-3 text-right">{f.vecesImpuntuales}</td>
                      <td className="py-2 pr-3 text-right">{formatMinutos(f.retrasoMedioSeg)}</td>
                      <td className="py-2 text-right">{formatMinutos(f.retrasoMaxSeg)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <BotonMostrarMas
              total={datosVista.length}
              visible={mostrarMas}
              onAmpliar={setMostrarMas}
            />
            <p className="mt-3 text-xs text-muted-foreground">{t('puntualidad.nota')}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
