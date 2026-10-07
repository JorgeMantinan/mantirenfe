import { memo, useMemo } from 'react';
import { FlatList, RefreshControl, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { horaGtfs, type PuntualidadTrenResponse } from '@mantirenfe/shared-types';
import { Etiqueta, Tarjeta } from '@/components/Tarjeta';
import { estilosTrenes } from '@/components/trenes/estilos';
import { useTema } from '@/lib/tema-contexto';

type ImpuntualesVistaProps = {
  /** ¿Sigue cargando la puntualidad del mes? (RefreshControl y vacío) */
  cargando: boolean;
  datos: PuntualidadTrenResponse[] | null;
  error: string | null;
  onRefrescar: () => void;
};

function formatMinutos(segundos: number): string {
  if (segundos < 60) return `${Math.round(segundos)} s`;
  return `${Math.round(segundos / 60)} min`;
}

export function ImpuntualesVista({ cargando, datos, error, onRefrescar }: ImpuntualesVistaProps) {
  const { paleta } = useTema();
  const { t } = useTranslation();
  const s = useMemo(() => estilosTrenes(paleta), [paleta]);

  return (
    <FlatList
      data={datos ?? []}
      keyExtractor={(item) => item.clave ?? item.vehiculoId}
      refreshControl={<RefreshControl refreshing={cargando} onRefresh={onRefrescar} />}
      contentContainerStyle={s.lista}
      ListHeaderComponent={
        error ? (
          <Tarjeta style={{ borderColor: paleta.error }}>
            <Text style={{ color: paleta.error }}>{error}</Text>
          </Tarjeta>
        ) : null
      }
      ListEmptyComponent={
        error ? null : (
          <Text style={s.vacio}>
            {cargando ? t('trenes.cargandoImpuntualidad') : t('trenes.sinImpuntualidad')}
          </Text>
        )
      }
      initialNumToRender={8}
      renderItem={({ item }) => <FilaImpuntual dato={item} />}
    />
  );
}

/**
 * Fila de impuntuales con `React.memo`: al refrescar solo se repinta lo que ha
 * cambiado de verdad (los datos de cada fila son referencias estables).
 */
const FilaImpuntual = memo(function FilaImpuntual({ dato }: { dato: PuntualidadTrenResponse }) {
  const { paleta } = useTema();
  const { t } = useTranslation();
  const s = useMemo(() => estilosTrenes(paleta), [paleta]);
  return (
    <Tarjeta>
      <View style={s.fila}>
        <Text style={s.nombre}>{dato.numeroTren ?? dato.vehiculoId}</Text>
        <Etiqueta tono="aviso">{t('trenes.veces', { n: dato.vecesImpuntuales })}</Etiqueta>
      </View>
      <Text style={s.meta}>
        {t('trenes.retrasoMedio', {
          medio: formatMinutos(dato.retrasoMedioSeg),
          peor: formatMinutos(dato.retrasoMaxSeg),
        })}
      </Text>
      {dato.origenNombre && dato.destinoNombre ? (
        <Text style={s.meta}>
          {dato.origenNombre} → {dato.destinoNombre}
        </Text>
      ) : null}
      {dato.salida ? (
        <Text style={s.meta}>
          {t('trenes.salidaHora', { hora: horaGtfs(dato.salida) })}
          {dato.fecha ? ` · ${dato.fecha}` : ''}
        </Text>
      ) : null}
      {dato.llegada || dato.llegadaEstimada ? (
        <Text style={s.meta}>
          {dato.llegada ? t('trenes.llegadaHora', { hora: horaGtfs(dato.llegada) }) : ''}
          {dato.llegada && dato.llegadaEstimada ? ' · ' : ''}
          {dato.llegadaEstimada
            ? t('trenes.llegadaEstimada', {
                hora: horaGtfs(dato.llegadaEstimada),
              })
            : ''}
        </Text>
      ) : null}
    </Tarjeta>
  );
});
