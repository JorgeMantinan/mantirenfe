import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '@/lib/api';
import { useRefresco } from '@/hooks/useRefresco';
import { ListaIncidencias } from '@/components/ListaIncidencias';
import { Skeleton } from '@/components/ui/skeleton';
import type { IncidenciaResponse } from '@/lib/incidencias';

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

  // Refresco cada minuto, en pausa con la pestaña oculta
  useRefresco(cargar, REFRESCO_MS);

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
      ) : (
        <ListaIncidencias incidencias={datos} vacio={t('incidencias.vacio')} />
      )}
    </div>
  );
}
