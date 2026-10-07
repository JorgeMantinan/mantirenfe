import { useTranslation } from 'react-i18next';
import { RefreshCw, Train } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { locale } from '@/i18n';
import { formatearPrecio } from '@/lib/precios';
import {
  duracionCorta,
  horaGtfs,
  textoConexion,
  type AlertaResponse,
  type EstadoSerializado,
} from '@mantirenfe/shared-types';
import type { TFunction } from 'i18next';

interface Props {
  alerta: AlertaResponse;
  trenes: EstadoSerializado[];
  cargando: boolean;
  onRecargar: () => void;
}

/** "hace X min" si es reciente; si no, fecha legible en el idioma activo. */
function haceCuanto(iso: string, t: TFunction): string {
  const minutos = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutos < 1) return t('detalleAlerta.haceMomento');
  if (minutos < 60) return t('detalleAlerta.haceMin', { min: minutos });
  return new Date(iso).toLocaleString(locale());
}

/**
 * Mensaje de la tarjeta de estado cuando `ultimoEstado` no tiene filas.
 *
 * Con criterio RETRASO el estado vacío no significa «no hay trenes»: significa
 * que ninguno va con retraso ahora mismo, así que se avisa en esos términos
 * (y se distingue de «todavía no se ha sondeado»). El resto de criterios
 * mantienen su mensaje habitual.
 */
function mensajeEstadoVacio(alerta: AlertaResponse, t: TFunction): string {
  const franja =
    alerta.horaDesde || alerta.horaHasta
      ? `${alerta.horaDesde ?? '00:00'}–${alerta.horaHasta ?? '23:59'}`
      : null;
  if (alerta.criterio === 'RETRASO') {
    if (!alerta.ultimoSondeoEn) {
      return t('detalleAlerta.vacioRetrasoSinSondeo', { min: alerta.intervaloSondeoMin });
    }
    const donde = franja
      ? t('detalleAlerta.vacioRetrasoFranja', { franja })
      : t('detalleAlerta.vacioRetrasoRuta');
    // N solo es conocible si se vigila un tren concreto
    const vigilancia = alerta.numeroTren ? t('detalleAlerta.vigilanciaTren') : '';
    return `${donde}${vigilancia}`;
  }
  if (alerta.criterio === 'PRECIO') {
    return t('detalleAlerta.vacioPrecio', { min: alerta.intervaloSondeoMin });
  }
  if (alerta.criterio === 'DISPONIBILIDAD' || alerta.criterio === 'APERTURA_VENTA') {
    return t('detalleAlerta.vacioPlazas', { min: alerta.intervaloSondeoMin });
  }
  return t('detalleAlerta.vacioSoloDisponibilidad');
}

/** Tabla del último sondeo: tren, plazas, precio y botón de actualizar. */
export function TarjetaEstado({ alerta, trenes, cargando, onRecargar }: Props) {
  const { t } = useTranslation();
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div className="space-y-1.5">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Train className="h-5 w-5 text-primary" aria-hidden="true" />
            {alerta.criterio === 'RETRASO'
              ? t('detalleAlerta.retrasosHoy')
              : t('detalleAlerta.plazasHoy')}
          </CardTitle>
          <CardDescription>
            {alerta.ultimoSondeoEn
              ? t('detalleAlerta.sondeoHace', {
                  hace: haceCuanto(alerta.ultimoSondeoEn, t),
                })
              : t('detalleAlerta.sondeoSinDatos')}
          </CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={onRecargar} disabled={cargando}>
          <RefreshCw aria-hidden="true" /> {t('estaciones.actualizar')}
        </Button>
      </CardHeader>
      <CardContent>
        {trenes.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">{t('detalleAlerta.colHora')}</th>
                  <th className="py-2 pr-3 font-medium">{t('tabla.tren')}</th>
                  <th className="py-2 pr-3 font-medium">{t('tabla.llegada')}</th>
                  <th className="py-2 pr-3 font-medium">{t('detalleAlerta.colPlazas')}</th>
                  <th className="py-2 font-medium text-right">
                    {t('detalleAlerta.colPrecioDesde')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {trenes.map((tren) => (
                  <tr key={`${tren.trenId}-${tren.salida}`} className="border-b last:border-b-0">
                    <td className="py-2 pr-3 font-medium">{horaGtfs(tren.salida)}</td>
                    <td className="py-2 pr-3">
                      <span>{tren.numeroTren || '—'}</span>
                      {tren.tipoTren && (
                        <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                          {tren.tipoTren}
                        </span>
                      )}
                      {tren.tramo === 'conexion' && (
                        <p className="text-xs text-muted-foreground">{textoConexion(tren)}</p>
                      )}
                    </td>
                    <td className="py-2 pr-3 text-muted-foreground">
                      {[
                        tren.horaLlegada,
                        typeof tren.duracionMin === 'number'
                          ? duracionCorta(tren.duracionMin)
                          : null,
                      ]
                        .filter(Boolean)
                        .join(' · ') || '—'}
                    </td>
                    <td className="py-2 pr-3">
                      {tren.cancelado ? (
                        <Badge variant="destructive">{t('estados.cancelado')}</Badge>
                      ) : (
                        <Badge variant={tren.disponible ? 'exito' : 'secondary'}>
                          {tren.disponible ? t('estados.hayPlazas') : t('estados.completo')}
                        </Badge>
                      )}
                      {tren.paradasSuprimidas && tren.paradasSuprimidas.length > 0 && (
                        <p className="mt-1 text-xs font-medium text-amber-700 dark:text-amber-300">
                          {t('detalleAlerta.noParaEn', {
                            lista: tren.paradasSuprimidas.join(', '),
                          })}
                        </p>
                      )}
                    </td>
                    <td className="py-2 text-right text-amber-700 dark:text-amber-300">
                      {formatearPrecio(tren.precioMin)}
                      {tren.tarifa && (
                        <p className="text-xs font-normal text-muted-foreground">{tren.tarifa}</p>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{mensajeEstadoVacio(alerta, t)}</p>
        )}
      </CardContent>
    </Card>
  );
}
