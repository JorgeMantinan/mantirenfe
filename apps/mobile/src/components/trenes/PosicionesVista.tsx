import { memo, useMemo } from 'react';
import { Linking, FlatList, RefreshControl, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { useTranslation } from 'react-i18next';
import {
  funcionIndemnizacion,
  horaGtfs,
  type PosicionTrenResponse,
} from '@mantirenfe/shared-types';
import { Etiqueta, Tarjeta } from '@/components/Tarjeta';
import { estilosTrenes } from '@/components/trenes/estilos';
import { useTema } from '@/lib/tema-contexto';

/** Origen permitido dentro del WebView del mapa (cualquier otro, fuera). */
const ORIGEN_MAPA = 'https://mantirenfe.vercel.app';

/** ¿Es una URL del propio mapa? (no basta con `startsWith`: evitaría spoofing) */
function esDelMapa(destino: string): boolean {
  if (destino === 'about:blank') return true;
  try {
    const parsed = new URL(destino);
    return parsed.protocol === 'https:' && parsed.host === 'mantirenfe.vercel.app';
  } catch {
    return false;
  }
}

/** Minúsculas sin tildes, para que "A Coruña" matchee con "La Coruña" o "coruña" */
function normalizarTexto(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function quitarArticulo(texto: string): string {
  return texto.replace(/^(la|el|los|las|a|o)\s+/, '');
}

type PosicionesVistaProps = {
  /** ¿Sigue pidiendo posiciones? (RefreshControl de la lista) */
  cargando: boolean;
  /** Listado completo: con él se decide si no hay posiciones o solo filtro. */
  posiciones: PosicionTrenResponse[];
  errorPosiciones: string | null;
  /** Texto del filtro (cabecera): define qué es visible y qué está vacío. */
  filtro: string;
  vista: 'lista' | 'mapa';
  onRefrescar: () => void;
};

export function PosicionesVista({
  cargando,
  posiciones,
  errorPosiciones,
  filtro,
  vista,
  onRefrescar,
}: PosicionesVistaProps) {
  const { paleta, oscuro } = useTema();
  const { t } = useTranslation();
  const s = useMemo(() => estilosTrenes(paleta), [paleta]);

  const visibles = useMemo(() => {
    const q = normalizarTexto(filtro);
    if (!q) return posiciones;
    const palabras = q
      .split(/\s+/)
      .filter((w) => !['la', 'el', 'los', 'las', 'a', 'o'].includes(w));
    if (palabras.length === 0) return posiciones;
    return posiciones.filter((p) => {
      const campos = [p.numeroTren, p.origenNombre, p.destinoNombre, p.id, p.operador]
        .filter(Boolean)
        .map((c) => quitarArticulo(normalizarTexto(String(c))));
      return palabras.every((palabra) => campos.some((c) => c.includes(palabra)));
    });
  }, [posiciones, filtro]);

  return (
    <>
      {vista === 'mapa' && (
        <View style={{ flex: 1 }}>
          {errorPosiciones ? (
            <Text style={[s.vacio, { color: paleta.error }]}>{errorPosiciones}</Text>
          ) : null}
          <WebView
            // `app=1` = sin cabecera/menú de la web; `tema` = modo de la app
            source={{ uri: `${ORIGEN_MAPA}/mapa?app=1&tema=${oscuro ? 'oscuro' : 'claro'}` }}
            style={{ flex: 1 }}
            startInLoadingState
            userAgent="MantiRenfeApp/1.0"
            // Solo el mapa de la app: cualquier otro destino se abre fuera
            originWhitelist={[`${ORIGEN_MAPA}/*`]}
            onShouldStartLoadWithRequest={(solicitud) => {
              if (esDelMapa(solicitud.url)) return true;
              void Linking.openURL(solicitud.url).catch(() => undefined);
              return false;
            }}
          />
        </View>
      )}

      {vista === 'lista' && (
        <FlatList
          data={visibles}
          keyExtractor={(item) => item.id}
          refreshControl={<RefreshControl refreshing={cargando} onRefresh={() => onRefrescar()} />}
          contentContainerStyle={s.lista}
          ListHeaderComponent={
            errorPosiciones ? (
              <Tarjeta style={{ borderColor: paleta.error }}>
                <Text style={{ color: paleta.error }}>{errorPosiciones}</Text>
              </Tarjeta>
            ) : posiciones.length === 0 ? (
              <Text style={s.vacio}>{t('trenes.sinPosiciones')}</Text>
            ) : visibles.length === 0 ? (
              <Text style={s.vacio}>{t('trenes.sinCoincidencias', { filtro })}</Text>
            ) : null
          }
          initialNumToRender={10}
          renderItem={({ item }) => <FilaPosicion posicion={item} />}
        />
      )}
    </>
  );
}

/**
 * Fila de posiciones con `React.memo`: al refrescar o filtrar solo se repinta
 * lo que ha cambiado de verdad (los datos de cada fila son referencias estables).
 */
const FilaPosicion = memo(function FilaPosicion({ posicion }: { posicion: PosicionTrenResponse }) {
  const { paleta } = useTema();
  const { t } = useTranslation();
  const s = useMemo(() => estilosTrenes(paleta), [paleta]);
  const indemnizacion =
    posicion.retrasoSeg != null ? funcionIndemnizacion(posicion.retrasoSeg) : null;
  return (
    <Tarjeta>
      <View style={s.fila}>
        <Text style={s.nombre}>{posicion.numeroTren ?? posicion.id}</Text>
        {posicion.cancelado ? <Etiqueta tono="error">{t('comunes.cancelado')}</Etiqueta> : null}
        {posicion.velocidadKmh != null ? (
          <Etiqueta>{Math.round(posicion.velocidadKmh)} km/h</Etiqueta>
        ) : null}
        {posicion.retrasoSeg != null ? (
          <Etiqueta tono={posicion.retrasoSeg >= 300 ? 'aviso' : 'exito'}>
            {posicion.retrasoSeg > 0
              ? `+${Math.round(posicion.retrasoSeg / 60)} min`
              : t('trenes.aTiempo')}
          </Etiqueta>
        ) : null}
      </View>
      {posicion.origenNombre && posicion.destinoNombre ? (
        <Text style={s.meta}>
          {posicion.origenNombre} → {posicion.destinoNombre}
        </Text>
      ) : null}
      {posicion.salida || posicion.llegada ? (
        <Text style={s.meta}>
          {posicion.salida ? t('trenes.salidaHora', { hora: horaGtfs(posicion.salida) }) : ''}
          {posicion.salida && posicion.llegada ? ' · ' : ''}
          {posicion.llegada ? t('trenes.llegadaHora', { hora: horaGtfs(posicion.llegada) }) : ''}
        </Text>
      ) : null}
      {posicion.operador ? <Text style={s.meta}>{posicion.operador}</Text> : null}
      {!posicion.origenNombre ? (
        <Text style={s.meta}>
          {posicion.latitud.toFixed(4)}, {posicion.longitud.toFixed(4)}
        </Text>
      ) : null}
      {indemnizacion ? (
        <Text style={s.indemnizacion}>
          {t('trenes.compromiso', { texto: indemnizacion.descripcion })}
        </Text>
      ) : null}
    </Tarjeta>
  );
});
