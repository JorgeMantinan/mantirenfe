import { useMemo } from 'react';
import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import {
  duracionCorta,
  horaGtfs,
  textoConexion,
  type AlertaResponse,
  type EstadoSerializado,
} from '@mantirenfe/shared-types';
import { Etiqueta, Tarjeta } from '@/components/Tarjeta';
import { estilosDetalle } from '@/components/alertas/estilos';
import { locale } from '@/i18n';
import { formatearPrecio } from '@/lib/precios';
import { useTema } from '@/lib/tema-contexto';

type Traductor = ReturnType<typeof useTranslation>['t'];

/** "hace X min" si es reciente; si no, fecha legible en el idioma activo. */
function haceCuanto(iso: string, t: Traductor): string {
  const minutos = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutos < 1) return t('detalle.haceMomento');
  if (minutos < 60) return t('detalle.haceMin', { min: minutos });
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
function mensajeEstadoVacio(alerta: AlertaResponse, t: Traductor): string {
  const franja =
    alerta.horaDesde || alerta.horaHasta
      ? `${alerta.horaDesde ?? '00:00'}–${alerta.horaHasta ?? '23:59'}`
      : null;
  if (alerta.criterio === 'RETRASO') {
    if (!alerta.ultimoSondeoEn) {
      return t('detalle.sinSondeo', { min: alerta.intervaloSondeoMin });
    }
    const donde = franja ? t('detalle.enFranja', { franja }) : t('detalle.enRuta');
    // N solo es conocible si se vigila un tren concreto
    const vigilancia = alerta.numeroTren ? t('detalle.vigilamos1') : '';
    return t('detalle.sinRetrasos', { donde, vigilancia });
  }
  if (alerta.criterio === 'PRECIO') {
    return t('detalle.sinPrecio', { min: alerta.intervaloSondeoMin });
  }
  if (alerta.criterio === 'DISPONIBILIDAD' || alerta.criterio === 'APERTURA_VENTA') {
    return t('detalle.sinPlazas', { min: alerta.intervaloSondeoMin });
  }
  return t('detalle.soloDisponibilidad');
}

/** "AVE · llega 09:48 · 3h48": lo que diferencia dos filas de la tabla. */
function detalleFila(tren: EstadoSerializado, t: Traductor): string {
  return [
    tren.tipoTren,
    tren.horaLlegada ? t('detalle.llega', { hora: tren.horaLlegada }) : null,
    typeof tren.duracionMin === 'number' ? duracionCorta(tren.duracionMin) : null,
  ]
    .filter((texto): texto is string => Boolean(texto))
    .join(' · ');
}

type Props = {
  alerta: AlertaResponse;
  /** Último estado serializado de la alerta (vacío = aún sin filas). */
  trenes: EstadoSerializado[];
};

/** «Estado de hoy»: tabla de trenes vigilados o mensaje de estado vacío. */
export function TarjetaEstado({ alerta, trenes }: Props) {
  const { paleta } = useTema();
  const { t } = useTranslation();
  const s = useMemo(() => estilosDetalle(paleta), [paleta]);
  return (
    <>
      <Text style={s.subtitulo}>
        {alerta.criterio === 'RETRASO' ? t('detalle.hoyRetrasos') : t('detalle.hoyPlazas')}
      </Text>
      <Tarjeta>
        {trenes.length > 0 ? (
          trenes.map((tren) => {
            const extras = detalleFila(tren, t);
            return (
              <View key={`${tren.trenId}-${tren.salida}`} style={s.fila}>
                <View style={s.plazaInfo}>
                  <Text style={s.plazaTren}>
                    {horaGtfs(tren.salida)} · {tren.numeroTren || '—'}
                  </Text>
                  {extras ? <Text style={s.detalle}>{extras}</Text> : null}
                  {tren.tramo === 'conexion' ? (
                    <Text style={s.detalle}>{textoConexion(tren)}</Text>
                  ) : null}
                  {tren.precioMin !== null ? (
                    <Text style={s.precio}>
                      {t('detalle.desde', { precio: formatearPrecio(tren.precioMin) })}
                      {tren.tarifa ? ` · ${tren.tarifa}` : ''}
                    </Text>
                  ) : null}
                  {tren.paradasSuprimidas && tren.paradasSuprimidas.length > 0 ? (
                    <Text style={s.noPara}>
                      {t('detalle.noPara', { lista: tren.paradasSuprimidas.join(', ') })}
                    </Text>
                  ) : null}
                </View>
                {tren.cancelado ? (
                  <Etiqueta tono="error">{t('comunes.cancelado')}</Etiqueta>
                ) : (
                  <Etiqueta tono={tren.disponible ? 'exito' : 'neutro'}>
                    {tren.disponible ? t('comunes.hayPlazas') : t('comunes.completo')}
                  </Etiqueta>
                )}
              </View>
            );
          })
        ) : (
          <>
            <Text style={s.detalle}>{mensajeEstadoVacio(alerta, t)}</Text>
            {alerta.ultimoSondeoEn ? (
              <Text style={s.fecha}>
                {t('detalle.ultimoSondeo', { valor: haceCuanto(alerta.ultimoSondeoEn, t) })}
              </Text>
            ) : null}
          </>
        )}
      </Tarjeta>
    </>
  );
}
