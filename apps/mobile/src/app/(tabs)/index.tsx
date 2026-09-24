import { useCallback, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { Alert, FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { AlertaResponse } from '@mantirenfe/shared-types';
import { Boton } from '@/components/Boton';
import { Etiqueta, Tarjeta } from '@/components/Tarjeta';
import { api } from '@/lib/api';
import { etiquetaEstado } from '@/lib/alertas';
import { colores, espaciado } from '@/lib/tema';

export default function Alertas() {
  const [alertas, setAlertas] = useState<AlertaResponse[]>([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(() => {
    setCargando(true);
    api<AlertaResponse[]>('/alertas')
      .then((datos) => {
        setAlertas(datos);
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

  const alternar = async (alerta: AlertaResponse) => {
    const nuevo = alerta.estado === 'ACTIVA' ? 'PAUSA' : 'ACTIVA';
    try {
      await api(`/alertas/${alerta.id}`, { method: 'PATCH', json: { estado: nuevo } });
      cargar();
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'No se pudo actualizar');
    }
  };

  const eliminar = (alerta: AlertaResponse) => {
    Alert.alert('Eliminar alerta', `¿Vigilar ${alerta.origenNombre} → ${alerta.destinoNombre}?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: () => {
          void api(`/alertas/${alerta.id}`, { method: 'DELETE' })
            .then(cargar)
            .catch((e: Error) => Alert.alert('Error', e.message));
        },
      },
    ]);
  };

  return (
    <View style={estilos.pantalla}>
      <View style={estilos.encabezado}>
        <Text style={estilos.titulo}>Mis alertas</Text>
        <Boton
          titulo="+ Nueva"
          onPress={() => router.push('/alertas/nueva')}
          style={estilos.botonNueva}
        />
      </View>

      {error ? (
        <Tarjeta style={{ borderColor: colores.error }}>
          <Text style={{ color: colores.error }}>{error}</Text>
        </Tarjeta>
      ) : null}

      <FlatList
        data={alertas}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={cargando} onRefresh={cargar} />}
        contentContainerStyle={estilos.lista}
        ListEmptyComponent={
          cargando ? null : (
            <View style={estilos.vacio}>
              <Ionicons name="notifications-off-outline" size={40} color={colores.primario} />
              <Text style={estilos.vacioTitulo}>Aún no tienes alertas</Text>
              <Text style={estilos.vacioTexto}>
                Crea una para tu próximo viaje y te avisaremos si se libera plaza.
              </Text>
              <Boton titulo="Crear la primera" onPress={() => router.push('/alertas/nueva')} />
            </View>
          )
        }
        renderItem={({ item }) => (
          <Tarjeta>
            <View style={estilos.filaAlerta}>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={estilos.ruta}>
                  {item.origenNombre} <Text style={{ color: colores.primario }}>→</Text>{' '}
                  {item.destinoNombre}
                </Text>
                <Text style={estilos.detalle}>
                  {item.fechaViaje} · cada {item.intervaloSondeoMin} min · {item.bono}
                </Text>
              </View>
              <Etiqueta
                tono={
                  item.estado === 'ACTIVA' ? 'exito' : item.estado === 'PAUSA' ? 'aviso' : 'neutro'
                }
              >
                {etiquetaEstado(item.estado)}
              </Etiqueta>
            </View>
            <View style={estilos.acciones}>
              <Boton
                titulo={item.estado === 'ACTIVA' ? 'Pausar' : 'Reanudar'}
                variante="contorno"
                onPress={() => void alternar(item)}
                style={estilos.botonAccion}
              />
              <Boton
                titulo="Eliminar"
                variante="fantasma"
                onPress={() => eliminar(item)}
                style={estilos.botonAccion}
              />
            </View>
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
    justifyContent: 'space-between',
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
  botonNueva: {
    minHeight: 40,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  lista: {
    padding: espaciado.md,
    gap: espaciado.sm,
  },
  filaAlerta: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: espaciado.sm,
  },
  ruta: {
    fontSize: 16,
    fontWeight: '700',
    color: colores.texto,
  },
  detalle: {
    fontSize: 13,
    color: colores.textoSecundario,
  },
  acciones: {
    flexDirection: 'row',
    gap: espaciado.sm,
  },
  botonAccion: {
    minHeight: 40,
    paddingVertical: 8,
    paddingHorizontal: 12,
    flex: 1,
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
    marginBottom: espaciado.sm,
  },
});
