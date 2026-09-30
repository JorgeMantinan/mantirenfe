import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TriangleAlert } from 'lucide-react';
import { api } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatoPeriodo, type IncidenciaResponse } from '@/lib/incidencias';

const REFRESCO_MS = 60_000;

export function PaginaIncidencias() {
  const { t } = useTranslation();
  const [datos, setDatos] = useState<IncidenciaResponse[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(() => {
    api<IncidenciaResponse[]>('/incidencias')
      .then((d) => {
        setDatos(d);
        setError(null);
      })
      .catch((e: Error) => {
        setError(e.message);
        setDatos([]);
      });
  }, []);

  useEffect(() => {
    cargar();
    const intervalo = setInterval(cargar, REFRESCO_MS);
    return () => clearInterval(intervalo);
  }, [cargar]);

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="font-heading text-3xl font-bold tracking-tight">
          {t('incidencias.titulo')}
        </h1>
        <p className="text-muted-foreground">{t('incidencias.subtitulo')}</p>
      </div>

      {error ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm">
          {error}
        </div>
      ) : null}

      {datos === null ? (
        <div className="space-y-3">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : datos.length === 0 ? (
        <Card>
          <CardContent className="py-14 text-center text-sm text-muted-foreground">
            {t('incidencias.vacio')}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {datos.map((incidencia) => (
            <Card key={incidencia.id}>
              <CardHeader>
                <CardTitle className="flex items-start gap-2 text-xl">
                  <TriangleAlert
                    className="mt-1 h-5 w-5 shrink-0 text-amber-500"
                    aria-hidden="true"
                  />
                  <span>{incidencia.titulo ?? t('incidencias.tituloFallback')}</span>
                </CardTitle>
                <CardDescription>
                  {formatoPeriodo(incidencia.desde, incidencia.hasta)}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  {incidencia.estacionesAfectadas.length > 0 ? (
                    incidencia.estacionesAfectadas.map((estacion) => (
                      <Badge key={estacion} variant="aviso">
                        {estacion}
                      </Badge>
                    ))
                  ) : (
                    <span className="text-sm text-muted-foreground">
                      {t('incidencias.sinEstacion')}
                    </span>
                  )}
                  {incidencia.causa ? <Badge variant="outline">{incidencia.causa}</Badge> : null}
                </div>
                {incidencia.mensaje ? (
                  <p className="whitespace-pre-line text-sm text-muted-foreground">
                    {incidencia.mensaje}
                  </p>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
