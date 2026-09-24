import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider } from '@/hooks/useAuth';
import { colores } from '@/lib/tema';

export default function RootLayout() {
  return (
    <AuthProvider>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colores.fondo },
          headerTintColor: colores.primario,
          headerTitleStyle: { fontWeight: '700', color: colores.texto },
          contentStyle: { backgroundColor: colores.fondoSecundario },
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ title: 'Iniciar sesión' }} />
        <Stack.Screen name="registro" options={{ title: 'Crear cuenta' }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="alertas/nueva"
          options={{ title: 'Nueva alerta', presentation: 'modal' }}
        />
      </Stack>
    </AuthProvider>
  );
}
