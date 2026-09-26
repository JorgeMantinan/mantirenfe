import { useCallback, useEffect, useState } from 'react';
import { CalendarClock } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { PuntualidadTrenResponse } from '@mantirenfe/shared-types';

function mesActual(): string {
  return new Date().toISOString().slice(0, 7);
}

function formatMinutos(segundos: number): string {
  if (segundos < 60) return `${segundos} s`;
  return `${Math.round(segundos / 60)} min`;
}

export function PaginaPuntualidad() {
  const [mes, setMes] = useState(mesActual);
  const [orden, setOrden] = useState<'veces' | 'impuntualidad'>('veces');
  const [datos, setDatos] = useState<PuntualidadTrenResponse[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(() => {
    setDatos(null);
    api<PuntualidadTrenResponse[]>(`/trenes/puntualidad?mes=${mes}&orden=${orden}`)
      .then((d) => {
        setDatos(d);
        setError(null);
      })
      .catch((e: Error) => {
        setError(e.message);
        setDatos([]);
      });
  }, [mes, orden]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-3xl font-bold tracking-tight">Trenes más impuntuales</h1>
          <p className="text-muted-foreground">
            Ranking mensual de servicios con retraso de 5 minutos o más, medido con los datos en
            vivo de Renfe
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <CalendarClock aria-hidden="true" className="h-4 w-4" />
          <span className="sr-only">Mes</span>
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
          Más veces impuntuales
        </Button>
        <Button
          variant={orden === 'impuntualidad' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setOrden('impuntualidad')}
        >
          Mayor impuntualidad media
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
            Aún no hay datos de impuntualidad para este mes. Vuelve dentro de un rato: medimos los
            retrasos en tiempo real mientras el mapa y las alertas están en marcha.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">
              {new Date(`${mes}-02T00:00:00Z`).toLocaleDateString('es-ES', {
                month: 'long',
                year: 'numeric',
                timeZone: 'UTC',
              })}
            </CardTitle>
            <CardDescription>
              Servicios impuntuales = un trayecto concreto de un tren que llegó con 5+ minutos de
              retraso
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">#</th>
                    <th className="py-2 pr-3 font-medium">Tren</th>
                    <th className="py-2 pr-3 font-medium">Trayecto habitual</th>
                    <th className="py-2 pr-3 font-medium">Salida</th>
                    <th className="py-2 pr-3 font-medium text-right">Servicios impuntuales</th>
                    <th className="py-2 pr-3 font-medium text-right">Retraso medio</th>
                    <th className="py-2 font-medium text-right">Peor retraso</th>
                  </tr>
                </thead>
                <tbody>
                  {datos.map((f, i) => (
                    <tr key={f.vehiculoId} className="border-b last:border-b-0">
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
                      <td className="py-2 pr-3 text-right">{f.vecesImpuntuales}</td>
                      <td className="py-2 pr-3 text-right">{formatMinutos(f.retrasoMedioSeg)}</td>
                      <td className="py-2 text-right">{formatMinutos(f.retrasoMaxSeg)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
