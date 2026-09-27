import { useCallback, useMemo, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { Alert, FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { NotificacionResponse } from '@mantirenfe/shared-types';
import { Boton } from '@/components/Boton';
import { Etiqueta, Tarjeta } from '@/components/Tarjeta';
import { api } from '@/lib/api';
import { useTema } from '@/lib/tema-contexto';
import { espaciado, type Paleta } from '@/lib/tema';

export default function Avisos() {
  const [notificaciones, setNotificaciones] = useState<NotificacionResponse[]>([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { paleta } = useTema();
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
      Alert.alert('Error', e instanceof Error ? e.message : 'No se pudo actualizar');
    }
  };

  const noLeidas = notificaciones.filter((n) => !n.leida).length;

  return (
    <View style={s.pantalla}>
      <View style={s.encabezado}>
        <View style={{ flex: 1 }}>
          <Text style={s.titulo}>Avisos</Text>
          <Text style={s.subtitulo}>{noLeidas > 0 ? `${noLeidas} sin leer` : 'Todo al día'}</Text>
        </View>
        <Boton
          titulo="Marcar leídas"
          variante="contorno"
          onPress={() => void marcarTodas()}
          style={{ minHeight: 40, paddingVertical: 8, paddingHorizontal: 12 }}
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
              <Text style={s.vacioTitulo}>Sin avisos todavía</Text>
              <Text style={s.vacioTexto}>
                Cuando una alerta detecte cambios, el aviso aparecerá aquí.
              </Text>
            </View>
          )
        }
        renderItem={({ item }) => (
          <Tarjeta style={item.leida ? { opacity: 0.75 } : undefined}>
            <View style={s.fila}>
              <Text style={s.tituloAviso}>{item.titulo}</Text>
              {!item.leida ? <Etiqueta tono="primario">Nuevo</Etiqueta> : null}
            </View>
            <Text style={s.cuerpo}>{item.cuerpo}</Text>
            <Text style={s.fecha}>{new Date(item.creadaEn).toLocaleString('es-ES')}</Text>
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
