import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { FlatList, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';
import type { EstacionResponse } from '@mantirenfe/shared-types';
import { Tarjeta } from '@/components/Tarjeta';
import { api } from '@/lib/api';
import { colores, espaciado, radio } from '@/lib/tema';

export default function Trenes() {
  const [estaciones, setEstaciones] = useState<EstacionResponse[]>([]);
  const [buscar, setBuscar] = useState('');
  const [cargando, setCargando] = useState(false);

  const cargar = useCallback((q?: string) => {
    setCargando(true);
    const query = q ? `&q=${encodeURIComponent(q)}` : '';
    api<EstacionResponse[]>(`/estaciones?limite=30${query}`)
      .then(setEstaciones)
      .catch(() => setEstaciones([]))
      .finally(() => setCargando(false));
  }, []);

  useFocusEffect(
    useCallback(() => {
      cargar();
    }, [cargar]),
  );

  const filtradas = buscar.trim()
    ? estaciones.filter((e) =>
        `${e.nombre} ${e.ciudad ?? ''}`.toLowerCase().includes(buscar.trim().toLowerCase()),
      )
    : estaciones;

  return (
    <View style={estilos.pantalla}>
      <View style={estilos.encabezado}>
        <Text style={estilos.titulo}>Estaciones</Text>
        <Text style={estilos.subtitulo}>Consulta horarios y posiciones en tiempo real</Text>
        <TextInput
          style={estilos.campo}
          placeholder="Buscar estación..."
          placeholderTextColor={colores.textoSecundario}
          value={buscar}
          onChangeText={setBuscar}
        />
      </View>
      <FlatList
        data={filtradas}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl refreshing={cargando} onRefresh={() => cargar(buscar || undefined)} />
        }
        contentContainerStyle={estilos.lista}
        renderItem={({ item }) => (
          <Tarjeta>
            <Text style={estilos.nombre}>{item.nombre}</Text>
            <Text style={estilos.meta}>
              {item.codigo}
              {item.ciudad ? ` · ${item.ciudad}` : ''}
            </Text>
          </Tarjeta>
        )}
        ListEmptyComponent={<Text style={estilos.vacio}>No se encontraron estaciones</Text>}
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
    backgroundColor: colores.fondo,
    padding: espaciado.md,
    gap: espaciado.sm,
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
  campo: {
    borderWidth: 1,
    borderColor: colores.borde,
    borderRadius: radio.md,
    paddingHorizontal: espaciado.md,
    paddingVertical: 10,
    fontSize: 15,
    color: colores.texto,
    backgroundColor: colores.fondoSecundario,
  },
  lista: {
    padding: espaciado.md,
    gap: espaciado.sm,
  },
  nombre: {
    fontSize: 16,
    fontWeight: '700',
    color: colores.texto,
  },
  meta: {
    fontSize: 13,
    color: colores.textoSecundario,
  },
  vacio: {
    textAlign: 'center',
    color: colores.textoSecundario,
    marginTop: espaciado.xl,
  },
});
