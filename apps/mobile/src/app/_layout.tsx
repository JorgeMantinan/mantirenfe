import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import * as Notifications from 'expo-notifications';
import { AuthProvider } from '@/hooks/useAuth';
import { TemaProvider, useTema } from '@/lib/tema-contexto';

// Muestra el aviso en primer plano (si no, el sistema lo descarta en foreground)
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

function irAUrlDeNotificacion(url: unknown) {
  if (typeof url !== 'string' || !url.startsWith('/')) return;
  if (url.startsWith('/alertas/')) {
    router.push({ pathname: '/alertas/[id]', params: { id: url.slice('/alertas/'.length) } });
  } else {
    router.push(url as never);
  }
}

export default function RootLayout() {
  useEffect(() => {
    const respuestaInicial = Notifications.getLastNotificationResponse();
    if (respuestaInicial) {
      irAUrlDeNotificacion(respuestaInicial.notification.request.content.data?.url);
    }
    const suscripcion = Notifications.addNotificationResponseReceivedListener((respuesta) => {
      irAUrlDeNotificacion(respuesta.notification.request.content.data?.url);
    });
    return () => suscripcion.remove();
  }, []);

  return (
    <TemaProvider>
      <Aplicacion />
    </TemaProvider>
  );
}

function Aplicacion() {
  const { paleta, oscuro } = useTema();

  return (
    <AuthProvider>
      <StatusBar style={oscuro ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: paleta.fondo },
          headerTintColor: paleta.primario,
          headerTitleStyle: { fontWeight: '700', color: paleta.texto },
          contentStyle: { backgroundColor: paleta.fondoSecundario },
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
        <Stack.Screen name="alertas/[id]" options={{ title: 'Alerta' }} />
      </Stack>
    </AuthProvider>
  );
}
