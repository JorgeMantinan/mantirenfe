import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CalendarClock } from 'lucide-react';
import { api } from '@/lib/api';
import { BotonMostrarMas } from '@/components/BotonMostrarMas';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { locale } from '@/i18n';
import { FILAS_INICIALES_TABLA } from '@/lib/ui-constants';
import type { PuntualidadTrenResponse } from '@mantirenfe/shared-types';

function mesActual(): string {
  return new Date().toISOString().slice(0, 7);
}

function formatMinutos(segundos: number): string {
  if (segundos < 60) return `${segundos} s`;
  return `${Math.round(segundos / 60)} min`;
}

export function PaginaPuntualidad() {
  const { t } = useTranslation();
  const [mes, setMes] = useState(mesActual);
  const [orden, setOrden] = useState<'veces' | 'impuntualidad'>('veces');
  const [datos, setDatos] = useState<PuntualidadTrenResponse[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mostrarMas, setMostrarMas] = useState(FILAS_INICIALES_TABLA);

  const cargar = useCallback(() => {
    setDatos(null);
    setMostrarMas(FILAS_INICIALES_TABLA);
    api<PuntualidadTrenResponse[]>(`/trenes/puntualidad?mes=${mes}&orden=${orden}`)
      .then((d) => {
        setDatos(d);
        setError(null);
      })
      .catch((e: unknown) => {
        setError(e instanceof Error && e.message ? e.message : t('comunes.error'));
        setDatos([]);
      });
  }, [mes, orden, t]);

  useEffect(() => {
    cargar();
  }, [cargar]);

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

      <div className="flex flex-wrap gap-2">
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
      </div>

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
            <CardDescription>{t('puntualidad.descripcion')}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">#</th>
                    <th className="py-2 pr-3 font-medium">{t('puntualidad.colTren')}</th>
                    <th className="py-2 pr-3 font-medium">{t('puntualidad.colTrayecto')}</th>
                    <th className="py-2 pr-3 font-medium">{t('puntualidad.colSalida')}</th>
                    <th className="py-2 pr-3 font-medium">{t('puntualidad.colLlegada')}</th>
                    <th className="py-2 pr-3 font-medium">{t('puntualidad.colLlegadaEstimada')}</th>
                    <th className="py-2 pr-3 font-medium text-right">
                      {t('puntualidad.colServicios')}
                    </th>
                    <th className="py-2 pr-3 font-medium text-right">
                      {t('puntualidad.colRetrasoMedio')}
                    </th>
                    <th className="py-2 font-medium text-right">
                      {t('puntualidad.colPeorRetraso')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {datos.slice(0, mostrarMas).map((f, i) => (
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
            <BotonMostrarMas total={datos.length} visible={mostrarMas} onAmpliar={setMostrarMas} />
            <p className="mt-3 text-xs text-muted-foreground">{t('puntualidad.nota')}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
