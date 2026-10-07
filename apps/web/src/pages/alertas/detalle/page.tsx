import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, TriangleAlert } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { ListaIncidencias } from '@/components/ListaIncidencias';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { construirIcs, descargarIcs, nombreFicheroIcs } from '@/lib/ics';
import { incidenciaAfectaA, type IncidenciaResponse } from '@/lib/incidencias';
import { agruparPrecios } from '@/lib/precios';
import type {
  AlertaResponse,
  AvisoAlertaResponse,
  EstadoSerializado,
  PuntoPrecio,
} from '@mantirenfe/shared-types';
import { TarjetaResumen } from './tarjeta-resumen';
import { TarjetaEstado } from './tarjeta-estado';
import { TarjetaPrecios } from './tarjeta-precios';
import { TarjetaAvisos } from './tarjeta-avisos';

export function PaginaDetalleAlerta() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const [alerta, setAlerta] = useState<AlertaResponse | null>(null);
  const [avisos, setAvisos] = useState<AvisoAlertaResponse[]>([]);
  const [incidencias, setIncidencias] = useState<IncidenciaResponse[]>([]);
  const [precios, setPrecios] = useState<PuntoPrecio[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const trenes: EstadoSerializado[] = alerta?.ultimoEstado ?? [];
  const seriesPrecios = agruparPrecios(precios);

  const cargar = useCallback(() => {
    if (!id) return;
    setCargando(true);
    Promise.all([
      api<AlertaResponse>(`/alertas/${id}`),
      // Histórico de avisos de ESA alerta: ya viene filtrado por la API
      api<AvisoAlertaResponse[]>(`/alertas/${id}/avisos`),
      // Si el feed de incidencias no responde, el detalle se muestra igual
      api<IncidenciaResponse[]>('/incidencias').catch(() => [] as IncidenciaResponse[]),
      // Histórico de precios: existe para disponibilidad y precio
      api<PuntoPrecio[]>(`/alertas/${id}/precios`).catch(() => [] as PuntoPrecio[]),
    ])
      .then(([a, avisosDeLaAlerta, incidenciasActivas, historial]) => {
        setAlerta(a);
        setPrecios(historial);
        setIncidencias(
          incidenciasActivas.filter((inc) =>
            incidenciaAfectaA(inc, [a.origenNombre, a.destinoNombre]),
          ),
        );
        setAvisos(avisosDeLaAlerta);
        // Al abrir el detalle se marcan como leídos los avisos de esta alerta
        const sinLeer = avisosDeLaAlerta.filter((n) => !n.leida).map((n) => n.id);
        if (sinLeer.length > 0) {
          void api('/notificaciones/marcar-leidas', { method: 'PATCH', json: { ids: sinLeer } })
            .then(() => setAvisos(avisosDeLaAlerta.map((n) => ({ ...n, leida: true }))))
            .catch(() => undefined);
        }
        setError(null);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setCargando(false));
  }, [id]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const compartir = async () => {
    if (!alerta) return;
    const url = `${window.location.origin}/alertas/nueva?origen=${encodeURIComponent(
      alerta.origenNombre,
    )}&destino=${encodeURIComponent(alerta.destinoNombre)}&fecha=${alerta.fechaViaje}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success(t('detalleAlerta.enlaceCopiado'));
    } catch {
      window.prompt(t('detalleAlerta.promptCompartir'), url);
    }
  };

  const anadirAlCalendario = () => {
    if (!alerta) return;
    try {
      descargarIcs(nombreFicheroIcs(alerta), construirIcs(alerta));
      toast.success(t('detalleAlerta.eventoDescargado'));
    } catch {
      toast.error(t('detalleAlerta.errorIcs'));
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-4 animate-fade-in">
      <div className="space-y-1">
        <Button variant="ghost" size="sm" asChild className="-ml-2">
          <Link to="/alertas">
            <ArrowLeft aria-hidden="true" /> {t('detalleAlerta.volver')}
          </Link>
        </Button>
        <h1 className="font-heading text-3xl font-bold tracking-tight">
          {t('detalleAlerta.titulo')}
        </h1>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm">
          {error}
        </div>
      )}

      {cargando ? (
        <>
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-20 w-full" />
        </>
      ) : (
        alerta && (
          <>
            <ListaIncidencias
              incidencias={incidencias}
              variante="caja"
              cabecera={
                <p className="flex items-center gap-2 font-semibold text-amber-700 dark:text-amber-300">
                  <TriangleAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
                  {t('detalleAlerta.incidenciaTitulo')}
                </p>
              }
              pie={
                <Link to="/incidencias" className="mt-2 inline-block font-medium underline">
                  {t('detalleAlerta.verTodas')}
                </Link>
              }
            />

            <TarjetaResumen
              alerta={alerta}
              onCompartir={compartir}
              onAnadirAlCalendario={anadirAlCalendario}
            />
            <TarjetaEstado
              alerta={alerta}
              trenes={trenes}
              cargando={cargando}
              onRecargar={cargar}
            />
            {(alerta.criterio === 'DISPONIBILIDAD' ||
              alerta.criterio === 'PRECIO' ||
              seriesPrecios.length > 0) && (
              <TarjetaPrecios alerta={alerta} seriesPrecios={seriesPrecios} />
            )}
            <TarjetaAvisos avisos={avisos} />
          </>
        )
      )}
    </div>
  );
}
