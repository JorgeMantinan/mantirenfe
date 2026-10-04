import { type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { TriangleAlert } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { formatoPeriodo, type IncidenciaResponse } from '@/lib/incidencias';

/**
 * Listado de incidencias compartido por la página de incidencias, la ficha
 * de estación y el detalle de alerta:
 * - `tarjetas`: una tarjeta por incidencia (página de incidencias).
 * - `caja`: caja ámbar con las incidencias ya filtradas (estación/alerta).
 */
export function ListaIncidencias({
  incidencias,
  variante = 'tarjetas',
  cabecera,
  pie,
  destacada,
  vacio,
}: {
  incidencias: IncidenciaResponse[];
  variante?: 'tarjetas' | 'caja';
  /** Cabecera propia de la caja (título fijo, icono, aviso…). */
  cabecera?: ReactNode;
  /** Pie de la caja (p. ej. el enlace a «todas las incidencias»). */
  pie?: ReactNode;
  /** Marca el título de cada incidencia en negrita con icono (caja estación). */
  destacada?: boolean;
  /** Texto cuando no hay incidencias (solo en variante `tarjetas`). */
  vacio?: ReactNode;
}) {
  const { t } = useTranslation();

  if (variante === 'caja') {
    if (incidencias.length === 0) return null;
    return (
      <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-4 text-sm">
        {cabecera}
        <ul className="mt-2 space-y-3">
          {incidencias.map((incidencia) => (
            <FilaIncidencia key={incidencia.id} incidencia={incidencia} destacada={destacada} />
          ))}
        </ul>
        {pie}
      </div>
    );
  }

  if (incidencias.length === 0) {
    return (
      <Card>
        <CardContent className="py-14 text-center text-sm text-muted-foreground">
          {vacio}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {incidencias.map((incidencia) => (
        <Card key={incidencia.id}>
          <CardHeader>
            <CardTitle className="flex items-start gap-2 text-xl">
              <TriangleAlert className="mt-1 h-5 w-5 shrink-0 text-amber-500" aria-hidden="true" />
              <span>{incidencia.titulo ?? t('incidencias.tituloFallback')}</span>
            </CardTitle>
            <CardDescription>{formatoPeriodo(incidencia.desde, incidencia.hasta)}</CardDescription>
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
  );
}

/** Título, periodo, estaciones afectadas y mensaje de una incidencia. */
function FilaIncidencia({
  incidencia,
  destacada,
}: {
  incidencia: IncidenciaResponse;
  destacada?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <li className="space-y-1">
      <p
        className={
          destacada
            ? 'flex items-center gap-2 font-semibold text-amber-700 dark:text-amber-300'
            : 'font-medium'
        }
      >
        {destacada ? <TriangleAlert className="h-4 w-4 shrink-0" aria-hidden="true" /> : null}
        {incidencia.titulo ?? t('incidencias.tituloFallback')}
      </p>
      <p className="text-xs text-muted-foreground">
        {formatoPeriodo(incidencia.desde, incidencia.hasta)}
      </p>
      {incidencia.estacionesAfectadas.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {t('estaciones.estacionesList', {
            lista: incidencia.estacionesAfectadas.join(', '),
          })}
        </p>
      )}
      {incidencia.mensaje && <p className="text-sm">{incidencia.mensaje}</p>}
    </li>
  );
}
