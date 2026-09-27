import { Redirect, Stack, router } from 'expo-router';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useMemo } from 'react';
import { Boton } from '@/components/Boton';
import { useAuth } from '@/hooks/useAuth';
import { useTema } from '@/lib/tema-contexto';
import { espaciado, type Paleta } from '@/lib/tema';

export default function Indice() {
  const { user, cargando } = useAuth();
  const { paleta } = useTema();
  const s = useMemo(() => estilos(paleta), [paleta]);

  if (cargando) {
    return (
      <View style={s.centro}>
        <ActivityIndicator size="large" color={paleta.primario} />
      </View>
    );
  }

  if (user) {
    return <Redirect href="/(tabs)" />;
  }

  return (
    <View style={s.pantalla}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={s.hero}>
        <View style={s.logo}>
          <Text style={s.logoTexto}>M</Text>
        </View>
        <Text style={s.titulo}>MantiRenfe</Text>
        <Text style={s.subtitulo}>
          Alertas de disponibilidad, cuenta atrás de tu viaje y trenes en tiempo real
        </Text>
      </View>
      <View style={s.acciones}>
        <Boton titulo="Iniciar sesión" onPress={() => router.push('/login')} />
        <Boton titulo="Crear cuenta" variante="contorno" onPress={() => router.push('/registro')} />
      </View>
    </View>
  );
}

const estilos = (c: Paleta) =>
  StyleSheet.create({
    pantalla: {
      flex: 1,
      backgroundColor: c.fondo,
      padding: espaciado.lg,
      justifyContent: 'space-between',
    },
    centro: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.fondo,
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
      backgroundColor: c.primario,
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
      color: c.texto,
      letterSpacing: -0.5,
    },
    subtitulo: {
      fontSize: 16,
      color: c.textoSecundario,
      textAlign: 'center',
      lineHeight: 24,
      maxWidth: 320,
    },
    acciones: {
      gap: espaciado.sm,
      paddingBottom: espaciado.lg,
    },
  });
