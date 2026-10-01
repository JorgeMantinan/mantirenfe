import { useTranslation } from 'react-i18next';
import { BarChart3 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card';
import { TIPO_AVISO_SIN_TIPO, type EstadisticasResponse } from '@mantirenfe/shared-types';

/**
 * "Tu actividad (30 días)": avisos recibidos con su desglose por tipo y estado
 * de las alertas. Sin datos (carga en curso o error de `GET /estadisticas`)
 * no se pinta nada: la tarjeta es optativa, no un hueco en el panel.
 */
export function TarjetaActividad({ datos }: { datos: EstadisticasResponse | null }) {
  const { t } = useTranslation();

  if (datos === null) return null;

  // Etiquetas ya traducidas: así el tipo que llega de la API (una cadena)
  // solo se usa para indexar, nunca como clave dinámica de i18n.
  const etiquetas: Record<string, string> = {
    [TIPO_AVISO_SIN_TIPO]: t('dashboard.actividadTipoAlertas'),
    cancelacion: t('dashboard.actividadTipoCancelacion'),
    parada_suprimida: t('dashboard.actividadTipoParadaSuprimida'),
    incidencia: t('dashboard.actividadTipoIncidencia'),
    'recordatorio-salida': t('dashboard.actividadTipoRecordatorio'),
    'resumen-viaje': t('dashboard.actividadTipoResumenViaje'),
    precio: t('dashboard.actividadTipoPrecio'),
    'digest-email': t('dashboard.actividadTipoDigest'),
    'resumen-semanal': t('dashboard.actividadTipoSemanal'),
  };

  const tipos = Object.entries(datos.avisos.porTipo).sort(([, a], [, b]) => b - a);
  const porTipo: Array<[string, number]> = [];
  let otros = 0;
  for (const [tipo, total] of tipos) {
    const etiqueta = etiquetas[tipo];
    if (etiqueta) porTipo.push([etiqueta, total]);
    else otros += total;
  }

  const avisos = datos.avisos.total;
  const { activas, completadas } = datos.alertas;
  const metricas = [
    avisos === 1 ? t('dashboard.actividadAviso1') : t('dashboard.actividadAvisosN', { n: avisos }),
    activas === 1
      ? t('dashboard.actividadActiva1')
      : t('dashboard.actividadActivasN', { n: activas }),
    completadas === 1
      ? t('dashboard.actividadCompletada1')
      : t('dashboard.actividadCompletadasN', { n: completadas }),
  ];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardDescription className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-primary" aria-hidden="true" />
          {t('dashboard.actividadTitulo', { dias: datos.periodoDias })}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 text-sm font-medium">
          {metricas.map((metrica) => (
            <span key={metrica}>{metrica}</span>
          ))}
        </div>
        {porTipo.length > 0 || otros > 0 ? (
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t('dashboard.actividadDesglose')}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {porTipo.map(([etiqueta, total]) => (
                <Badge key={etiqueta} variant="outline">
                  {etiqueta} · {total}
                </Badge>
              ))}
              {otros > 0 ? (
                <Badge variant="outline">
                  {t('dashboard.actividadTipoOtro')} · {otros}
                </Badge>
              ) : null}
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
