import { Redirect, Stack, router } from 'expo-router';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Boton } from '@/components/Boton';
import { useAuth } from '@/hooks/useAuth';
import { colores, espaciado } from '@/lib/tema';

export default function Indice() {
  const { user, cargando } = useAuth();

  if (cargando) {
    return (
      <View style={estilos.centro}>
        <ActivityIndicator size="large" color={colores.primario} />
      </View>
    );
  }

  if (user) {
    return <Redirect href="/(tabs)" />;
  }

  return (
    <View style={estilos.pantalla}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={estilos.hero}>
        <View style={estilos.logo}>
          <Text style={estilos.logoTexto}>M</Text>
        </View>
        <Text style={estilos.titulo}>MantiRenfe</Text>
        <Text style={estilos.subtitulo}>
          Alertas de disponibilidad, cuenta atrás de tu viaje y trenes en tiempo real
        </Text>
      </View>
      <View style={estilos.acciones}>
        <Boton titulo="Iniciar sesión" onPress={() => router.push('/login')} />
        <Boton titulo="Crear cuenta" variante="contorno" onPress={() => router.push('/registro')} />
      </View>
    </View>
  );
}

const estilos = StyleSheet.create({
  pantalla: {
    flex: 1,
    backgroundColor: colores.fondo,
    padding: espaciado.lg,
    justifyContent: 'space-between',
  },
  centro: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colores.fondo,
  },
  hero: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: espaciado.md,
  },
  logo: {
    width: 88,
    height: 88,
    borderRadius: 24,
    backgroundColor: colores.primario,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoTexto: {
    color: '#fff',
    fontSize: 44,
    fontWeight: '800',
  },
  titulo: {
    fontSize: 34,
    fontWeight: '800',
    color: colores.texto,
    letterSpacing: -0.5,
  },
  subtitulo: {
    fontSize: 16,
    color: colores.textoSecundario,
    textAlign: 'center',
    lineHeight: 24,
    maxWidth: 320,
  },
  acciones: {
    gap: espaciado.sm,
    paddingBottom: espaciado.lg,
  },
});
