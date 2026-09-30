import { useCallback, useMemo, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { Alert, FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import type { NotificacionResponse } from '@mantirenfe/shared-types';
import { Boton } from '@/components/Boton';
import { Etiqueta, Tarjeta } from '@/components/Tarjeta';
import { locale } from '@/i18n';
import { api } from '@/lib/api';
import { useTema } from '@/lib/tema-contexto';
import { espaciado, type Paleta } from '@/lib/tema';

export default function Avisos() {
  const [notificaciones, setNotificaciones] = useState<NotificacionResponse[]>([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { paleta } = useTema();
  const { t } = useTranslation();
  const s = useMemo(() => estilos(paleta), [paleta]);

  const cargar = useCallback(() => {
    setCargando(true);
    api<NotificacionResponse[]>('/notificaciones')
      .then((datos) => {
        setNotificaciones(datos);
        setError(null);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setCargando(false));
  }, []);

  useFocusEffect(
    useCallback(() => {
      cargar();
    }, [cargar]),
  );

  const marcarTodas = async () => {
    const ids = notificaciones.filter((n) => !n.leida).map((n) => n.id);
    if (ids.length === 0) return;
    try {
      await api('/notificaciones/marcar-leidas', { method: 'PATCH', json: { ids } });
      cargar();
    } catch (e) {
      Alert.alert(
        t('comunes.error'),
        e instanceof Error ? e.message : t('comunes.errorActualizar'),
      );
    }
  };

  const limpiarLista = () => {
    if (notificaciones.length === 0) return;
    Alert.alert(t('avisos.limpiarTitulo'), t('avisos.limpiarCuerpo'), [
      { text: t('comunes.cancelar'), style: 'cancel' },
      {
        text: t('avisos.borrar'),
        style: 'destructive',
        onPress: async () => {
          try {
            await api('/notificaciones', { method: 'DELETE' });
            setNotificaciones([]);
          } catch (e) {
            Alert.alert(
              t('comunes.error'),
              e instanceof Error ? e.message : t('avisos.errorVaciar'),
            );
          }
        },
      },
    ]);
  };

  const noLeidas = notificaciones.filter((n) => !n.leida).length;

  return (
    <View style={s.pantalla}>
      <View style={s.encabezado}>
        <View style={{ flex: 1 }}>
          <Text style={s.titulo}>{t('pestanas.avisos')}</Text>
          <Text style={s.subtitulo}>
            {noLeidas > 0 ? t('avisos.sinLeer', { n: noLeidas }) : t('avisos.todoAlDia')}
          </Text>
        </View>
        <Boton
          titulo={t('avisos.marcarLeidas')}
          variante="contorno"
          onPress={() => void marcarTodas()}
          style={{ minHeight: 40, paddingVertical: 8, paddingHorizontal: 12 }}
        />
        <Boton
          titulo={t('avisos.limpiar')}
          variante="fantasma"
          onPress={limpiarLista}
          style={{ minHeight: 40, paddingVertical: 8, paddingHorizontal: 8 }}
        />
      </View>

      {error ? (
        <Tarjeta style={{ borderColor: paleta.error, margin: espaciado.md }}>
          <Text style={{ color: paleta.error }}>{error}</Text>
        </Tarjeta>
      ) : null}

      <FlatList
        data={notificaciones}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={cargando} onRefresh={cargar} />}
        contentContainerStyle={s.lista}
        ListEmptyComponent={
          cargando ? null : (
            <View style={s.vacio}>
              <Ionicons name="mail-open-outline" size={40} color={paleta.primario} />
              <Text style={s.vacioTitulo}>{t('avisos.vacioTitulo')}</Text>
              <Text style={s.vacioTexto}>{t('avisos.vacioTexto')}</Text>
            </View>
          )
        }
        renderItem={({ item }) => (
          <Tarjeta style={item.leida ? { opacity: 0.75 } : undefined}>
            <View style={s.fila}>
              <Text style={s.tituloAviso}>{item.titulo}</Text>
              {!item.leida ? <Etiqueta tono="primario">{t('comunes.nuevo')}</Etiqueta> : null}
            </View>
            <Text style={s.cuerpo}>{item.cuerpo}</Text>
            <Text style={s.fecha}>{new Date(item.creadaEn).toLocaleString(locale())}</Text>
          </Tarjeta>
        )}
      />
    </View>
  );
}

const estilos = (c: Paleta) =>
  StyleSheet.create({
    pantalla: {
      flex: 1,
      backgroundColor: c.fondoSecundario,
    },
    encabezado: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: espaciado.sm,
      paddingHorizontal: espaciado.md,
      paddingVertical: espaciado.sm,
      backgroundColor: c.fondo,
      borderBottomWidth: 1,
      borderBottomColor: c.borde,
    },
    titulo: {
      fontSize: 22,
      fontWeight: '800',
      color: c.texto,
    },
    subtitulo: {
      fontSize: 13,
      color: c.textoSecundario,
    },
    lista: {
      padding: espaciado.md,
      gap: espaciado.sm,
    },
    fila: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: espaciado.sm,
    },
    tituloAviso: {
      flex: 1,
      fontSize: 16,
      fontWeight: '700',
      color: c.texto,
    },
    cuerpo: {
      fontSize: 14,
      color: c.textoSecundario,
      lineHeight: 20,
    },
    fecha: {
      fontSize: 12,
      color: c.textoSecundario,
    },
    vacio: {
      alignItems: 'center',
      gap: espaciado.sm,
      paddingVertical: espaciado.xl,
    },
    vacioTitulo: {
      fontSize: 17,
      fontWeight: '700',
      color: c.texto,
    },
    vacioTexto: {
      fontSize: 14,
      color: c.textoSecundario,
      textAlign: 'center',
      maxWidth: 280,
    },
  });
