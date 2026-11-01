import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '@/lib/api';
import { useRefresco } from '@/hooks/useRefresco';
import { useMetaPagina } from '@/hooks/useMetaPagina';
import { ListaIncidencias } from '@/components/ListaIncidencias';
import { Skeleton } from '@/components/ui/skeleton';
import { locale } from '@/i18n';
import type { IncidenciaResponse } from '@/lib/incidencias';

const REFRESCO_MS = 60_000;
/** A partir de aquí la lista se considera «sin novedades» y se avisa. */
const DIAS_SIN_NOVEDAD_AVISO = 14;

export function PaginaIncidencias() {
  useMetaPagina('/incidencias');
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

  // El feed puede quedarse congelado del lado del publisher (así pasó del 7 al
  // 29 de octubre: el servidor seguía vivo pero dejó de generar avisos). Como
  // la baja de una incidencia depende de que desaparezca del feed, la lista
  // se quedaría enseñando lo último como si estuviera al día: se avisa de la
  // antigüedad en vez de fingir frescura.
  const ultimaNovedad = useMemo(() => {
    const fechas = (datos ?? [])
      .map((incidencia) => (incidencia.desde ? Date.parse(incidencia.desde) : Number.NaN))
      .filter((ms) => Number.isFinite(ms));
    if (fechas.length === 0) return null;
    const ultima = Math.max(...fechas);
    return { fecha: ultima, dias: Math.floor((Date.now() - ultima) / 86_400_000) };
  }, [datos]);

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="font-heading text-3xl font-bold tracking-tight">
          {t('incidencias.titulo')}
        </h1>
        <p className="text-muted-foreground">{t('incidencias.subtitulo')}</p>
      </div>

      {ultimaNovedad && ultimaNovedad.dias > DIAS_SIN_NOVEDAD_AVISO ? (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
          {t('incidencias.feedCongelado', {
            fecha: new Date(ultimaNovedad.fecha).toLocaleDateString(locale(), {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            }),
            dias: ultimaNovedad.dias,
          })}
        </div>
      ) : null}

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
