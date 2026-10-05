import { useState, type KeyboardEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { TriangleAlert } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { formatoPeriodo, type IncidenciaResponse } from '@/lib/incidencias';

/** Enter y Espacio activan los elementos con `role="button"`. */
function alTeclear(e: KeyboardEvent<HTMLElement>, alActivar: () => void) {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  e.preventDefault();
  alActivar();
}

/** Etiqueta accesible de la incidencia, con su título real o el de reserva. */
function etiquetaDetalle(incidencia: IncidenciaResponse, verDetalle: string, fallback: string) {
  return `${verDetalle}: ${incidencia.titulo ?? fallback}`;
}

/**
 * Listado de incidencias compartido por la página de incidencias, la ficha
 * de estación y el detalle de alerta:
 * - `tarjetas`: una tarjeta por incidencia (página de incidencias).
 * - `caja`: caja ámbar con las incidencias ya filtradas (estación/alerta).
 *
 * Cada incidencia es clicable y abre un diálogo con su información completa.
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
  // Incidencia seleccionada; su detalle se pinta en el diálogo (null = cerrado)
  const [detalle, setDetalle] = useState<IncidenciaResponse | null>(null);

  let contenido: ReactNode = null;

  if (variante === 'caja') {
    if (incidencias.length > 0) {
      contenido = (
        <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-4 text-sm">
          {cabecera}
          <ul className="mt-2 space-y-3">
            {incidencias.map((incidencia) => (
              <FilaIncidencia
                key={incidencia.id}
                incidencia={incidencia}
                destacada={destacada}
                onAbrir={setDetalle}
              />
            ))}
          </ul>
          {pie}
        </div>
      );
    }
  } else if (incidencias.length === 0) {
    contenido = (
      <Card>
        <CardContent className="py-14 text-center text-sm text-muted-foreground">
          {vacio}
        </CardContent>
      </Card>
    );
  } else {
    contenido = (
      <div className="space-y-4">
        {incidencias.map((incidencia) => (
          <TarjetaIncidencia key={incidencia.id} incidencia={incidencia} onAbrir={setDetalle} />
        ))}
      </div>
    );
  }

  return (
    <>
      {contenido}
      <DialogoDetalle
        incidencia={detalle}
        onOpenChange={(abierto) => {
          if (!abierto) setDetalle(null);
        }}
      />
    </>
  );
}

/** Tarjeta clicable de la página de incidencias. */
function TarjetaIncidencia({
  incidencia,
  onAbrir,
}: {
  incidencia: IncidenciaResponse;
  onAbrir: (incidencia: IncidenciaResponse) => void;
}) {
  const { t } = useTranslation();
  const titulo = incidencia.titulo ?? t('incidencias.tituloFallback');
  return (
    <Card
      role="button"
      tabIndex={0}
      aria-label={etiquetaDetalle(
        incidencia,
        t('incidencias.verDetalle'),
        t('incidencias.tituloFallback'),
      )}
      className="cursor-pointer transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      onClick={() => onAbrir(incidencia)}
      onKeyDown={(e) => alTeclear(e, () => onAbrir(incidencia))}
    >
      <CardHeader>
        <CardTitle className="flex items-start gap-2 text-xl">
          <TriangleAlert className="mt-1 h-5 w-5 shrink-0 text-amber-500" aria-hidden="true" />
          <span>{titulo}</span>
        </CardTitle>
        <CardDescription>{formatoPeriodo(incidencia.desde, incidencia.hasta)}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <IncidenciaEstaciones incidencia={incidencia} />
          {incidencia.causa ? <Badge variant="outline">{incidencia.causa}</Badge> : null}
        </div>
        {incidencia.mensaje ? (
          <p className="whitespace-pre-line text-sm text-muted-foreground">{incidencia.mensaje}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}

/** Fila clicable de la caja ámbar (ficha de estación y detalle de alerta). */
function FilaIncidencia({
  incidencia,
  destacada,
  onAbrir,
}: {
  incidencia: IncidenciaResponse;
  destacada?: boolean;
  onAbrir: (incidencia: IncidenciaResponse) => void;
}) {
  const { t } = useTranslation();
  const titulo = incidencia.titulo ?? t('incidencias.tituloFallback');
  return (
    <li>
      <div
        role="button"
        tabIndex={0}
        aria-label={etiquetaDetalle(
          incidencia,
          t('incidencias.verDetalle'),
          t('incidencias.tituloFallback'),
        )}
        className="space-y-1 cursor-pointer rounded-md transition-colors hover:bg-amber-500/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={() => onAbrir(incidencia)}
        onKeyDown={(e) => alTeclear(e, () => onAbrir(incidencia))}
      >
        <p
          className={
            destacada
              ? 'flex items-center gap-2 font-semibold text-amber-700 dark:text-amber-300'
              : 'font-medium'
          }
        >
          {destacada ? <TriangleAlert className="h-4 w-4 shrink-0" aria-hidden="true" /> : null}
          {titulo}
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
      </div>
    </li>
  );
}

/** Badges de estaciones afectadas, o el aviso de «sin estación concreta». */
function IncidenciaEstaciones({ incidencia }: { incidencia: IncidenciaResponse }) {
  const { t } = useTranslation();
  if (incidencia.estacionesAfectadas.length > 0) {
    return (
      <>
        {incidencia.estacionesAfectadas.map((estacion) => (
          <Badge key={estacion} variant="aviso">
            {estacion}
          </Badge>
        ))}
      </>
    );
  }
  return <span className="text-sm text-muted-foreground">{t('incidencias.sinEstacion')}</span>;
}

/** Diálogo con la información completa de una incidencia (Escape lo cierra). */
function DialogoDetalle({
  incidencia,
  onOpenChange,
}: {
  incidencia: IncidenciaResponse | null;
  onOpenChange: (abierto: boolean) => void;
}) {
  const { t } = useTranslation();
  return (
    <Dialog open={incidencia !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('incidencias.detalleTitulo')}</DialogTitle>
        </DialogHeader>
        {incidencia ? (
          <div className="space-y-4 text-sm">
            <div className="space-y-1">
              <p className="text-base font-semibold">
                {incidencia.titulo ?? t('incidencias.tituloFallback')}
              </p>
              <p className="text-muted-foreground">
                {formatoPeriodo(incidencia.desde, incidencia.hasta)}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <IncidenciaEstaciones incidencia={incidencia} />
              {incidencia.causa ? <Badge variant="outline">{incidencia.causa}</Badge> : null}
            </div>
            {incidencia.mensaje ? (
              <p className="whitespace-pre-line">{incidencia.mensaje}</p>
            ) : null}
            <DialogFooter>
              <Button type="button" onClick={() => onOpenChange(false)}>
                {t('comunes.cerrar')}
              </Button>
            </DialogFooter>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
