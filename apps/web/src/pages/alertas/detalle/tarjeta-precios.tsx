import { useTranslation } from 'react-i18next';
import { Coins } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { locale } from '@/i18n';
import {
  agruparContagos,
  anchoBarra,
  consejoPrecio,
  esSeriePlana,
  formatearPrecio,
  recortarContagos,
  textoSerieCompacta,
  textoSondeosOcultos,
  type SeriePrecio,
} from '@/lib/precios';
import { horaGtfs, type AlertaResponse } from '@mantirenfe/shared-types';

interface Props {
  alerta: AlertaResponse;
  seriesPrecios: SeriePrecio[];
}

/** Evolución del precio mínimo por tren en los últimos sondeos. */
export function TarjetaPrecios({ alerta, seriesPrecios }: Props) {
  const { t } = useTranslation();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Coins className="h-5 w-5 text-primary" aria-hidden="true" />
          {t('detalleAlerta.precioEvolucion')}
        </CardTitle>
        <CardDescription>{t('detalleAlerta.precioEvolucionDesc')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {seriesPrecios.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('detalleAlerta.precioSinHistorico')}</p>
        ) : (
          <div className="space-y-3">
            {seriesPrecios.map((serie) => {
              const plana = esSeriePlana(serie.puntos);
              const { visibles, sondeosOcultos } = recortarContagos(agruparContagos(serie.puntos));
              if (plana) {
                return (
                  <p key={serie.clave} className="text-sm">
                    {textoSerieCompacta(serie)}{' '}
                    <span className="font-medium text-amber-700 dark:text-amber-300">
                      {consejoPrecio(serie.puntos)}
                    </span>
                  </p>
                );
              }
              return (
                <div key={serie.clave} className="space-y-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                    <span className="font-medium">
                      {horaGtfs(serie.salida)}
                      {serie.numeroTren ? t('precios.serieTren', { tren: serie.numeroTren }) : ''}
                    </span>
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {formatearPrecio(serie.minimo)} – {formatearPrecio(serie.maximo)}
                    </span>
                  </div>
                  <ul className="space-y-0.5">
                    {visibles.map((grupo, indice) => (
                      <li
                        key={`${grupo.registradoEn}-${indice}`}
                        className="flex items-center gap-2"
                        title={[
                          new Date(grupo.registradoEn).toLocaleString(locale()),
                          formatearPrecio(grupo.precioMin),
                          grupo.cantidad === 1
                            ? t('detalleAlerta.tooltipSondeo1')
                            : t('detalleAlerta.tooltipSondeoN', { n: grupo.cantidad }),
                          grupo.disponible
                            ? t('detalleAlerta.tooltipDisponible')
                            : t('detalleAlerta.tooltipCompleto'),
                        ].join(' · ')}
                      >
                        <span className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
                          <span
                            className="block h-full rounded-full bg-amber-500"
                            style={{
                              width: `${anchoBarra(grupo.precioMin, serie.minimo, serie.maximo)}%`,
                            }}
                          />
                        </span>
                        <span
                          className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                            grupo.disponible ? 'bg-emerald-500' : 'bg-gray-400'
                          }`}
                          aria-hidden="true"
                        />
                        <span className="w-20 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">
                          {formatearPrecio(grupo.precioMin)}
                        </span>
                        <span className="w-7 shrink-0 text-right text-[11px] font-medium tabular-nums text-muted-foreground">
                          {grupo.cantidad > 1 ? `×${grupo.cantidad}` : ''}
                        </span>
                      </li>
                    ))}
                  </ul>
                  {sondeosOcultos > 0 ? (
                    <p className="text-[11px] text-muted-foreground">
                      {textoSondeosOcultos(sondeosOcultos)}
                    </p>
                  ) : null}
                  <p className="text-xs font-medium text-amber-700 dark:text-amber-300">
                    {consejoPrecio(serie.puntos)}
                  </p>
                </div>
              );
            })}
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          {t('detalleAlerta.precioBase', { min: alerta.intervaloSondeoMin })}
        </p>
      </CardContent>
    </Card>
  );
}
