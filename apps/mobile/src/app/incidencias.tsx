import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Boton } from '@/components/Boton';
import { Etiqueta, Tarjeta } from '@/components/Tarjeta';
import { api } from '@/lib/api';
import {
  contenidoLista,
  cuerpo,
  filaTitulo,
  fondoPantalla,
  meta,
  nombreFlex,
} from '@/lib/estilos-comunes';
import { formatoPeriodo, type IncidenciaResponse } from '@/lib/incidencias';
import { useTema } from '@/lib/tema-contexto';
import { espaciado, type Paleta } from '@/lib/tema';

export default function Incidencias() {
  const [datos, setDatos] = useState<IncidenciaResponse[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  // Incidencia abierta en el modal de detalle (null = cerrado)
  const [detalle, setDetalle] = useState<IncidenciaResponse | null>(null);
  const { paleta } = useTema();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const s = useMemo(() => estilos(paleta), [paleta]);

  // `cancelado` evita setState tras desmontar; `peticion` evita que una
  // respuesta vieja pise la de un refresco más reciente.
  const cancelado = useRef(false);
  const peticion = useRef(0);

  const cargar = useCallback(() => {
    cancelado.current = false;
    const id = ++peticion.current;
    setCargando(true);
    api<IncidenciaResponse[]>('/incidencias')
      .then((d) => {
        if (cancelado.current || peticion.current !== id) return;
        setDatos(d);
        setError(null);
      })
      .catch((e: Error) => {
        if (cancelado.current || peticion.current !== id) return;
        setError(e.message);
        setDatos([]);
      })
      .finally(() => {
        if (peticion.current !== id) return;
        setCargando(false);
      });
  }, []);

  // Carga al montar + pull-to-refresh (en la web refresca cada 60 s; aquí basta
  // con recargar al volver o palear)
  useEffect(() => {
    cargar();
    return () => {
      cancelado.current = true;
      peticion.current++;
    };
  }, [cargar]);

  return (
    <View style={s.pantalla}>
      <FlatList
        data={datos ?? []}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={cargando} onRefresh={cargar} />}
        contentContainerStyle={s.lista}
        ListHeaderComponent={
          <View style={s.intro}>
            <Text style={s.titulo}>{t('incidencias.titulo')}</Text>
            <Text style={s.subtitulo}>{t('incidencias.subtitulo')}</Text>
          </View>
        }
        ListEmptyComponent={
          cargando && datos === null ? (
            <ActivityIndicator color={paleta.primario} style={{ marginTop: espaciado.xl }} />
          ) : error ? null : (
            <Tarjeta>
              <Text style={s.vacioTitulo}>{t('incidencias.vacioTitulo')}</Text>
              <Text style={s.vacioTexto}>{t('incidencias.vacioTexto')}</Text>
            </Tarjeta>
          )
        }
        ListFooterComponent={
          error ? (
            <Tarjeta style={{ borderColor: paleta.error }}>
              <Text style={{ color: paleta.error }}>{error}</Text>
            </Tarjeta>
          ) : null
        }
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${t('incidencias.verDetalle')}: ${
              item.titulo ?? t('incidencias.fallbackTitulo')
            }`}
            onPress={() => setDetalle(item)}
            style={({ pressed }) => ({ opacity: pressed ? 0.9 : 1 })}
          >
            <Tarjeta style={{ borderColor: paleta.aviso }}>
              <View style={s.filaTitulo}>
                <Ionicons name="warning-outline" size={20} color={paleta.aviso} />
                <Text style={s.tituloIncidencia}>
                  {item.titulo ?? t('incidencias.fallbackTitulo')}
                </Text>
              </View>
              <Text style={s.periodo}>{formatoPeriodo(item.desde, item.hasta)}</Text>
              <View style={s.badges}>
                {item.estacionesAfectadas.length > 0 ? (
                  item.estacionesAfectadas.map((estacion) => (
                    <Etiqueta key={estacion} tono="aviso">
                      {estacion}
                    </Etiqueta>
                  ))
                ) : (
                  <Text style={s.meta}>{t('incidencias.sinEstacion')}</Text>
                )}
                {item.causa ? <Etiqueta tono="primario">{item.causa}</Etiqueta> : null}
              </View>
              {item.mensaje ? <Text style={s.mensaje}>{item.mensaje}</Text> : null}
            </Tarjeta>
          </Pressable>
        )}
      />

      {/* Detalle completo de la incidencia seleccionada */}
      <Modal
        visible={detalle !== null}
        animationType="slide"
        onRequestClose={() => setDetalle(null)}
        accessibilityViewIsModal
      >
        <View style={[s.modal, { paddingTop: insets.top }]}>
          <View style={s.modalCabecera}>
            <Text style={s.modalTitulo}>{t('incidencias.detalleTitulo')}</Text>
          </View>
          <ScrollView
            contentContainerStyle={[s.modalCuerpo, { paddingBottom: insets.bottom + espaciado.lg }]}
          >
            {detalle ? (
              <>
                <Text style={s.modalIncTitulo}>
                  {detalle.titulo ?? t('incidencias.fallbackTitulo')}
                </Text>
                <Text style={s.periodo}>{formatoPeriodo(detalle.desde, detalle.hasta)}</Text>
                <View style={s.badges}>
                  {detalle.estacionesAfectadas.length > 0 ? (
                    detalle.estacionesAfectadas.map((estacion) => (
                      <Etiqueta key={estacion} tono="aviso">
                        {estacion}
                      </Etiqueta>
                    ))
                  ) : (
                    <Text style={s.meta}>{t('incidencias.sinEstacion')}</Text>
                  )}
                  {detalle.causa ? <Etiqueta tono="primario">{detalle.causa}</Etiqueta> : null}
                </View>
                {detalle.mensaje ? <Text style={s.mensajeCompleto}>{detalle.mensaje}</Text> : null}
              </>
            ) : null}
          </ScrollView>
          <View style={[s.modalPie, { paddingBottom: insets.bottom + espaciado.sm }]}>
            <Boton
              titulo={t('comunes.cerrar')}
              variante="contorno"
              onPress={() => setDetalle(null)}
              style={s.botonCerrar}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const estilos = (c: Paleta) =>
  StyleSheet.create({
    pantalla: fondoPantalla(c),
    lista: contenidoLista(),
    intro: {
      marginBottom: espaciado.sm,
      gap: 2,
    },
    titulo: {
      fontSize: 20,
      fontWeight: '800',
      color: c.texto,
    },
    subtitulo: meta(c),
    filaTitulo: filaTitulo(c),
    tituloIncidencia: nombreFlex(c),
    periodo: meta(c),
    badges: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      gap: espaciado.sm,
    },
    meta: meta(c),
    mensaje: cuerpo(c),
    vacioTitulo: {
      fontSize: 16,
      fontWeight: '700',
      color: c.texto,
      textAlign: 'center',
    },
    vacioTexto: {
      fontSize: 13,
      color: c.textoSecundario,
      textAlign: 'center',
    },
    // Modal de detalle a pantalla completa
    modal: {
      flex: 1,
      backgroundColor: c.fondo,
    },
    modalCabecera: {
      paddingHorizontal: espaciado.md,
      paddingVertical: espaciado.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.borde,
    },
    modalTitulo: {
      fontSize: 18,
      fontWeight: '800',
      color: c.texto,
    },
    modalCuerpo: {
      flex: 1,
      paddingHorizontal: espaciado.md,
      paddingTop: espaciado.md,
      gap: espaciado.sm,
    },
    modalIncTitulo: {
      fontSize: 16,
      fontWeight: '700',
      color: c.texto,
    },
    mensajeCompleto: {
      fontSize: 14,
      color: c.texto,
      lineHeight: 21,
    },
    modalPie: {
      paddingHorizontal: espaciado.md,
      paddingTop: espaciado.sm,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: c.borde,
    },
    botonCerrar: {
      width: '100%',
    },
  });
