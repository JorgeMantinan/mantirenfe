import { memo, useMemo, useState } from 'react';
import { FlatList, RefreshControl, Text, TextInput, View } from 'react-native';
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
  /** Texto del buscador (la petición va con el valor ya debounced). */
  q: string;
  onQ: (texto: string) => void;
};

type ColImpuntuales = 'veces' | 'medio' | 'peor';

function formatMinutos(segundos: number): string {
  if (segundos < 60) return `${Math.round(segundos)} s`;
  return `${Math.round(segundos / 60)} min`;
}

export function ImpuntualesVista({
  cargando,
  datos,
  error,
  onRefrescar,
  q,
  onQ,
}: ImpuntualesVistaProps) {
  const { paleta } = useTema();
  const { t } = useTranslation();
  const s = useMemo(() => estilosTrenes(paleta), [paleta]);
  // Ordenación local por columna (los datos vienen por «veces» de la API)
  const [ordenCol, setOrdenCol] = useState<{ col: ColImpuntuales; dir: 'asc' | 'desc' } | null>(
    null,
  );

  const datosVista = useMemo(() => {
    const arr = datos ?? [];
    if (!ordenCol) return arr;
    const dir = ordenCol.dir === 'asc' ? 1 : -1;
    return [...arr].sort((a, b) => {
      if (ordenCol.col === 'veces') return (a.vecesImpuntuales - b.vecesImpuntuales) * dir;
      if (ordenCol.col === 'medio') return (a.retrasoMedioSeg - b.retrasoMedioSeg) * dir;
      return (a.retrasoMaxSeg - b.retrasoMaxSeg) * dir;
    });
  }, [datos, ordenCol]);

  const etiquetas: Record<ColImpuntuales, string> = {
    veces: t('trenes.orden.veces'),
    medio: t('trenes.orden.retraso'),
    peor: t('trenes.ordenPeor'),
  };
  const columnas: ColImpuntuales[] = ['veces', 'medio', 'peor'];

  const alternarOrden = (col: ColImpuntuales) => {
    if (ordenCol?.col === col) {
      setOrdenCol({ col, dir: ordenCol.dir === 'desc' ? 'asc' : 'desc' });
    } else {
      setOrdenCol({ col, dir: 'desc' });
    }
  };

  return (
    <FlatList
      data={datosVista}
      keyExtractor={(item) => item.clave ?? item.vehiculoId}
      refreshControl={<RefreshControl refreshing={cargando} onRefresh={() => onRefrescar()} />}
      contentContainerStyle={s.lista}
      ListHeaderComponent={
        <View style={{ gap: 8, marginBottom: 8 }}>
          {error ? (
            <Tarjeta style={{ borderColor: paleta.error }}>
              <Text style={{ color: paleta.error }}>{error}</Text>
            </Tarjeta>
          ) : null}
          <TextInput
            style={s.campo}
            placeholder={t('trenes.buscarImpuntuales')}
            placeholderTextColor={paleta.textoSecundario}
            value={q}
            onChangeText={onQ}
          />
          <View style={s.modos}>
            {columnas.map((col) => (
              <Text
                key={col}
                style={[s.modo, ordenCol?.col === col && s.modoActivo]}
                onPress={() => alternarOrden(col)}
                suppressHighlighting
              >
                {etiquetas[col]}
                {ordenCol?.col === col ? (ordenCol.dir === 'desc' ? ' ↓' : ' ↑') : ''}
              </Text>
            ))}
            {ordenCol ? (
              <Text style={s.modo} onPress={() => setOrdenCol(null)} suppressHighlighting>
                {t('trenes.reiniciarOrden')}
              </Text>
            ) : null}
          </View>
        </View>
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
