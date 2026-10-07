import { useMemo } from 'react';
import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { horaGtfs } from '@mantirenfe/shared-types';
import { Tarjeta } from '@/components/Tarjeta';
import { estilosDetalle } from '@/components/alertas/estilos';
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
import { useTema } from '@/lib/tema-contexto';

type Props = {
  /** Series agrupadas por tren+salida (vacío = sin histórico de precios). */
  series: SeriePrecio[];
};

/** «Evolución de precio»: serie compacta si no se mueve o barras por tramo. */
export function SeccionPrecios({ series }: Props) {
  const { paleta } = useTema();
  const { t } = useTranslation();
  const s = useMemo(() => estilosDetalle(paleta), [paleta]);
  return (
    <>
      <Text style={s.subtitulo}>{t('detalle.evolucionTitulo')}</Text>
      <Tarjeta>
        <Text style={s.detalle}>{t('detalle.evolucionSubtitulo')}</Text>
        {series.length === 0 ? (
          <Text style={s.detalle}>{t('detalle.sinEvolucion')}</Text>
        ) : (
          series.map((serie) => {
            const plana = esSeriePlana(serie.puntos);
            const { visibles, sondeosOcultos } = recortarContagos(agruparContagos(serie.puntos));
            if (plana) {
              return (
                <Text key={serie.clave} style={s.detalle}>
                  {textoSerieCompacta(serie)}
                  {' · '}
                  <Text style={s.consejo}>{consejoPrecio(serie.puntos)}</Text>
                </Text>
              );
            }
            return (
              <View key={serie.clave} style={s.serie}>
                <View style={s.serieCabecera}>
                  <Text style={s.plazaTren}>
                    {horaGtfs(serie.salida)}
                    {serie.numeroTren ? t('detalle.trenSufijo', { tren: serie.numeroTren }) : ''}
                  </Text>
                  <Text style={s.fecha}>
                    {formatearPrecio(serie.minimo)} – {formatearPrecio(serie.maximo)}
                  </Text>
                </View>
                {visibles.map((grupo, indice) => (
                  <View key={`${grupo.registradoEn}-${indice}`} style={s.barraFila}>
                    <View style={s.barra}>
                      <View
                        style={[
                          s.barraRelleno,
                          { width: `${anchoBarra(grupo.precioMin, serie.minimo, serie.maximo)}%` },
                        ]}
                      />
                    </View>
                    <View
                      style={[
                        s.puntoFinal,
                        {
                          backgroundColor: grupo.disponible ? paleta.exito : paleta.textoSecundario,
                        },
                      ]}
                    />
                    <Text style={s.barraPrecio}>{formatearPrecio(grupo.precioMin)}</Text>
                    <Text style={s.multiplicador}>
                      {grupo.cantidad > 1 ? `×${grupo.cantidad}` : ''}
                    </Text>
                  </View>
                ))}
                {sondeosOcultos > 0 ? (
                  <Text style={s.resumen}>{textoSondeosOcultos(sondeosOcultos)}</Text>
                ) : null}
                <Text style={s.consejo}>{consejoPrecio(serie.puntos)}</Text>
              </View>
            );
          })
        )}
      </Tarjeta>
    </>
  );
}
