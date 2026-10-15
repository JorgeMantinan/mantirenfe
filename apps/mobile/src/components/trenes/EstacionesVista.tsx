import { memo, useEffect, useMemo, useState } from 'react';
import { router } from 'expo-router';
import { FlatList, Linking, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import {
  horaGtfs,
  type EstacionDetalleResponse,
  type EstacionResponse,
  type HorarioTrenResponse,
} from '@mantirenfe/shared-types';
import { Boton } from '@/components/Boton';
import { Tarjeta } from '@/components/Tarjeta';
import { estilosTrenes } from '@/components/trenes/estilos';
import { BotonPlazas } from '@/components/trenes/BotonPlazas';
import { PanelPlazasPrecio } from '@/components/trenes/PanelPlazasPrecio';
import { locale } from '@/i18n';
import { useTema } from '@/lib/tema-contexto';
import { espaciado } from '@/lib/tema';

type EstacionesVistaProps = {
  /** ¿Sigue cargando el listado de estaciones? (RefreshControl y vacío) */
  cargando: boolean;
  estaciones: EstacionResponse[];
  cargandoMas: boolean;
  onRefrescar: () => void;
  onCargarMas: () => void;
  /** Estación con la tarjeta de salidas abierta ('' = ninguna). */
  estacionSel: string;
  onElegirEstacion: (nombre: string, estacion: EstacionResponse) => void;
  // Tarjeta de salidas de la estación seleccionada
  salidas: HorarioTrenResponse[] | null;
  cargandoSalidas: boolean;
  errorSalidas: string | null;
  detalle: EstacionDetalleResponse | null;
  detalleListo: boolean;
  coordsSel: { lat: number; lng: number } | null;
  onCerrarSalidas: () => void;
  /** Cambia al modo «horarios» (aviso y botón «Buscar trenes»). */
  onBuscarTrenes: () => void;
};

/** Enlace externo a OpenStreetMap con la estación centrada (zoom 16). */
function mapaExterno(latitud: number, longitud: number): string {
  return `https://www.openstreetmap.org/?mlat=${latitud}&mlon=${longitud}#map=16/${latitud}/${longitud}`;
}

export function EstacionesVista({
  cargando,
  estaciones,
  cargandoMas,
  onRefrescar,
  onCargarMas,
  estacionSel,
  onElegirEstacion,
  salidas,
  cargandoSalidas,
  errorSalidas,
  detalle,
  detalleListo,
  coordsSel,
  onCerrarSalidas,
  onBuscarTrenes,
}: EstacionesVistaProps) {
  const { paleta } = useTema();
  const { t } = useTranslation();
  const s = useMemo(() => estilosTrenes(paleta), [paleta]);
  // Fila de salidas con el panel «Plazas y precio» desplegado (null = ninguna)
  const [plazasSalida, setPlazasSalida] = useState<string | null>(null);
  useEffect(() => setPlazasSalida(null), [estacionSel]);

  // Ficha de la estación seleccionada (fallo tolerado: sin ficha no se rompe nada)
  const latitud = detalle?.latitud ?? coordsSel?.lat ?? null;
  const longitud = detalle?.longitud ?? coordsSel?.lng ?? null;
  const urlMapa = latitud !== null && longitud !== null ? mapaExterno(latitud, longitud) : null;
  const aforos = (detalle?.aforos ?? []).slice(0, 3);
  const lineaFicha = [
    detalle?.poblacion,
    detalle?.provincia,
    detalle?.cp ? `CP ${detalle.cp}` : null,
  ]
    .filter((valor): valor is string => Boolean(valor))
    .join(' · ');

  return (
    <>
      {(cargandoSalidas || salidas !== null) && (
        <Tarjeta style={{ borderColor: paleta.primario, marginHorizontal: espaciado.md }}>
          <View style={s.fila}>
            <Text style={s.nombre}>
              {cargandoSalidas
                ? t('trenes.cargandoSalidas')
                : t('trenes.salidasDe', { estacion: estacionSel })}
            </Text>
            <Text style={{ color: paleta.primario, fontWeight: '600' }} onPress={onCerrarSalidas}>
              {t('comunes.cerrar')}
            </Text>
          </View>
          {!cargandoSalidas && !detalleListo ? (
            <Text style={s.meta}>{t('trenes.cargandoEstacion')}</Text>
          ) : detalle ? (
            <View style={s.ficha}>
              {detalle.direccion ? <Text style={s.meta}>{detalle.direccion}</Text> : null}
              {lineaFicha ? <Text style={s.meta}>{lineaFicha}</Text> : null}
              {urlMapa ? (
                <Boton
                  titulo={t('trenes.verMapa')}
                  variante="contorno"
                  onPress={() => {
                    void Linking.openURL(urlMapa).catch(() => undefined);
                  }}
                  style={s.botonMapa}
                />
              ) : null}
              {aforos.length > 0 ? (
                <View style={s.aforos}>
                  <Text style={s.nombre}>{t('trenes.aforo')}</Text>
                  {aforos.map((aforo) => (
                    <Text key={aforo.franja} style={s.meta}>
                      {aforo.franja} ·{' '}
                      {t('trenes.viajeros', {
                        n: (aforo.subidos + aforo.bajados).toLocaleString(locale()),
                      })}
                    </Text>
                  ))}
                </View>
              ) : null}
            </View>
          ) : null}
          {/* Un fallo no es «sin salidas»: se distingue el catch del vacío */}
          {errorSalidas ? (
            <Text style={{ color: paleta.error, fontSize: 13 }}>{errorSalidas}</Text>
          ) : !cargandoSalidas && (salidas ?? []).length === 0 ? (
            <Text style={s.meta}>{t('trenes.sinSalidas')}</Text>
          ) : (
            <ScrollView style={s.salidasScroll} nestedScrollEnabled>
              {(salidas ?? []).map((salida, i) => {
                const clave = `${salida.numeroTren}-${salida.salida}`;
                const esConsultada = Boolean(estacionSel && salida.destinoNombre !== estacionSel);
                const plazasAbiertas = plazasSalida === clave;
                return (
                  <View key={clave} style={{ marginTop: 6 }}>
                    <Text style={s.nombre}>
                      {horaGtfs(salida.salida)} · {salida.numeroTren}
                    </Text>
                    <Text style={s.meta}>
                      {salida.origenNombre} → {salida.destinoNombre}
                      {salida.operador ? ` · ${salida.operador}` : ''}
                    </Text>
                    {esConsultada ? (
                      <View
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 12,
                          marginTop: 4,
                        }}
                      >
                        <BotonPlazas
                          activo={plazasAbiertas}
                          onPress={() => setPlazasSalida(plazasAbiertas ? null : clave)}
                        />
                        <Pressable
                          onPress={() =>
                            router.push(
                              `/alertas/nueva?origen=${encodeURIComponent(estacionSel)}` +
                                `&destino=${encodeURIComponent(salida.destinoNombre)}` +
                                `&fecha=${new Date().toISOString().slice(0, 10)}` +
                                `&numeroTren=${encodeURIComponent(salida.numeroTren)}`,
                            )
                          }
                        >
                          <Text style={{ color: paleta.primario, fontSize: 13, fontWeight: '600' }}>
                            {t('trenes.crearAlertaFila')}
                          </Text>
                        </Pressable>
                      </View>
                    ) : null}
                    {esConsultada && plazasAbiertas ? (
                      <PanelPlazasPrecio
                        origen={estacionSel}
                        destino={salida.destinoNombre}
                        fecha={new Date().toISOString().slice(0, 10)}
                      />
                    ) : null}
                  </View>
                );
              })}
            </ScrollView>
          )}
        </Tarjeta>
      )}

      <FlatList
        data={estaciones}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={cargando} onRefresh={() => onRefrescar()} />}
        contentContainerStyle={s.lista}
        onEndReachedThreshold={0.4}
        onEndReached={onCargarMas}
        initialNumToRender={10}
        ListFooterComponent={
          <View style={{ marginTop: 12, gap: 8 }}>
            {cargandoMas ? <Text style={s.pieLista}>{t('trenes.cargandoMas')}</Text> : null}
            <Boton
              titulo={t('trenes.irABuscarTrenes')}
              onPress={onBuscarTrenes}
              style={{ alignSelf: 'center' }}
            />
          </View>
        }
        renderItem={({ item }) => (
          <FilaEstacion
            estacion={item}
            activa={estacionSel === item.nombre}
            onPulsar={onElegirEstacion}
          />
        )}
        ListEmptyComponent={
          <Text style={s.vacio}>{cargando ? t('trenes.buscando') : t('trenes.noEstaciones')}</Text>
        }
      />
    </>
  );
}

/**
 * Filas de las listas grandes, fuera del render de la pantalla y con
 * `React.memo`: al refrescar o escribir en el buscador solo se repinta lo que
 * ha cambiado de verdad (los datos de cada fila son referencias estables).
 */
const FilaEstacion = memo(function FilaEstacion({
  estacion,
  activa,
  onPulsar,
}: {
  estacion: EstacionResponse;
  activa: boolean;
  onPulsar: (nombre: string, estacion: EstacionResponse) => void;
}) {
  const { paleta } = useTema();
  const { t } = useTranslation();
  const s = useMemo(() => estilosTrenes(paleta), [paleta]);
  return (
    <Tarjeta style={{ borderColor: activa ? paleta.primario : undefined }}>
      <Pressable onPress={() => onPulsar(estacion.nombre, estacion)}>
        <Text style={s.nombre}>{estacion.nombre}</Text>
        <Text style={s.meta}>
          {t('trenes.tocaSalidas', {
            meta: `${estacion.codigo}${estacion.ciudad ? ` · ${estacion.ciudad}` : ''}`,
          })}
        </Text>
      </Pressable>
    </Tarjeta>
  );
});
