import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { Alert, FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { NotificacionResponse } from '@mantirenfe/shared-types';
import { Boton } from '@/components/Boton';
import { Etiqueta, Tarjeta } from '@/components/Tarjeta';
import { api } from '@/lib/api';
import { colores, espaciado } from '@/lib/tema';

export default function Avisos() {
  const [notificaciones, setNotificaciones] = useState<NotificacionResponse[]>([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    <View style={estilos.pantalla}>
      <View style={estilos.encabezado}>
        <View style={{ flex: 1 }}>
          <Text style={estilos.titulo}>Avisos</Text>
          <Text style={estilos.subtitulo}>
            {noLeidas > 0 ? `${noLeidas} sin leer` : 'Todo al día'}
          </Text>
        </View>
        <Boton
          titulo="Marcar leídas"
          variante="contorno"
          onPress={() => void marcarTodas()}
          style={{ minHeight: 40, paddingVertical: 8, paddingHorizontal: 12 }}
        />
      </View>

      {error ? (
        <Tarjeta style={{ borderColor: colores.error, margin: espaciado.md }}>
          <Text style={{ color: colores.error }}>{error}</Text>
        </Tarjeta>
      ) : null}

      <FlatList
        data={notificaciones}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={cargando} onRefresh={cargar} />}
        contentContainerStyle={estilos.lista}
        ListEmptyComponent={
          cargando ? null : (
            <View style={estilos.vacio}>
              <Ionicons name="mail-open-outline" size={40} color={colores.primario} />
              <Text style={estilos.vacioTitulo}>Sin avisos todavía</Text>
              <Text style={estilos.vacioTexto}>
                Cuando una alerta detecte cambios, el aviso aparecerá aquí.
              </Text>
            </View>
          )
        }
        renderItem={({ item }) => (
          <Tarjeta style={item.leida ? { opacity: 0.75 } : undefined}>
            <View style={estilos.fila}>
              <Text style={estilos.tituloAviso}>{item.titulo}</Text>
              {!item.leida ? <Etiqueta tono="primario">Nuevo</Etiqueta> : null}
            </View>
            <Text style={estilos.cuerpo}>{item.cuerpo}</Text>
            <Text style={estilos.fecha}>{new Date(item.creadaEn).toLocaleString('es-ES')}</Text>
          </Tarjeta>
        )}
      />
    </View>
  );
}

const estilos = StyleSheet.create({
  pantalla: {
    flex: 1,
    backgroundColor: colores.fondoSecundario,
  },
  encabezado: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaciado.sm,
    paddingHorizontal: espaciado.md,
    paddingVertical: espaciado.sm,
    backgroundColor: colores.fondo,
    borderBottomWidth: 1,
    borderBottomColor: colores.borde,
  },
  titulo: {
    fontSize: 22,
    fontWeight: '800',
    color: colores.texto,
  },
  subtitulo: {
    fontSize: 13,
    color: colores.textoSecundario,
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
    color: colores.texto,
  },
  cuerpo: {
    fontSize: 14,
    color: colores.textoSecundario,
    lineHeight: 20,
  },
  fecha: {
    fontSize: 12,
    color: colores.textoSecundario,
  },
  vacio: {
    alignItems: 'center',
    gap: espaciado.sm,
    paddingVertical: espaciado.xl,
  },
  vacioTitulo: {
    fontSize: 17,
    fontWeight: '700',
    color: colores.texto,
  },
  vacioTexto: {
    fontSize: 14,
    color: colores.textoSecundario,
    textAlign: 'center',
    maxWidth: 280,
  },
});
