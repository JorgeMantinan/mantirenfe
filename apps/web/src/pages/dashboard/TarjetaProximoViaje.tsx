import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Plus, Train } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  cuentaAtras,
  etiquetaDia,
  proximaSalida,
  relojPeninsular,
  textoPlazas,
  variantePlazas,
} from '@/lib/proximoViaje';
import type { AlertaResponse } from '@mantirenfe/shared-types';

/** Cada cuánto se re-calcula la cuenta atrás (la hora de salida no se mueve). */
const INTERVALO_CUENTA_ATRAS_MS = 60_000;

/**
 * Tarjeta protagonista del dashboard: la próxima salida entre las alertas
 * activas, con cuenta atrás, estado de plazas y acceso al detalle.
 */
export function TarjetaProximoViaje({ alertas }: { alertas: AlertaResponse[] | null }) {
  const { t } = useTranslation();
  const [ahora, setAhora] = useState(() => new Date());

  useEffect(() => {
    const id = window.setInterval(() => setAhora(new Date()), INTERVALO_CUENTA_ATRAS_MS);
    return () => window.clearInterval(id);
  }, []);

  if (alertas === null) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-7 w-64" />
        </CardHeader>
        <CardContent className="flex items-end justify-between gap-4">
          <div className="space-y-2">
            <Skeleton className="h-9 w-48" />
            <Skeleton className="h-4 w-56" />
          </div>
          <Skeleton className="h-9 w-28" />
        </CardContent>
      </Card>
    );
  }

  const salida = proximaSalida(alertas, ahora);

  if (!salida) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardDescription className="flex items-center gap-2">
            <Train className="h-4 w-4 text-primary" aria-hidden="true" />
            {t('dashboard.proximoViaje')}
          </CardDescription>
          <CardTitle className="text-2xl">{t('dashboard.sinSalidasTitulo')}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center justify-between gap-3">
          <p className="max-w-prose text-sm text-muted-foreground">
            {alertas.length === 0 ? t('dashboard.sinAlertasTexto') : t('dashboard.sinSalidasTexto')}
          </p>
          <Button asChild size="sm">
            <Link to="/alertas/nueva">
              <Plus aria-hidden="true" /> {t('comunes.crearAlerta')}
            </Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const hoy = relojPeninsular(ahora).fecha;
  const etiqueta = etiquetaDia(salida.fecha, hoy);
  const detalles = [salida.salida ?? t('dashboard.horaPorConfirmar')];
  if (salida.numeroTren) detalles.push(t('dashboard.trenNumero', { numero: salida.numeroTren }));
  const linea = salida.salida ? `${etiqueta} · ${detalles.join(' · ')}` : detalles.join(' · ');

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3 space-y-0">
          <div className="space-y-1.5">
            <CardDescription className="flex items-center gap-2">
              <Train className="h-4 w-4 text-primary" aria-hidden="true" />
              {t('dashboard.proximoViaje')}
            </CardDescription>
            <CardTitle className="text-2xl">
              {salida.origenNombre} → {salida.destinoNombre}
            </CardTitle>
          </div>
          <Badge variant={variantePlazas(salida.estado)}>{textoPlazas(salida)}</Badge>
        </div>
      </CardHeader>
      <CardContent className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <p className="font-heading text-4xl font-bold tabular-nums">
            {salida.salidaEn === null ? etiqueta : cuentaAtras(salida.salidaEn - ahora.getTime())}
          </p>
          <p className="text-sm text-muted-foreground">{linea}</p>
          {salida.estado === 'sin-datos' && (
            <p className="text-xs text-muted-foreground">
              {t('dashboard.sinDatosPlazas', { min: salida.intervaloSondeoMin })}
            </p>
          )}
        </div>
        <Button asChild>
          <Link to={`/alertas/${salida.alertaId}`}>{t('dashboard.verAlerta')}</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
