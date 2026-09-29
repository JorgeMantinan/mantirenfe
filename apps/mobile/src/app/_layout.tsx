import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Notifications from 'expo-notifications';
import { AuthProvider } from '@/hooks/useAuth';
import { destinoDeNotificacion } from '@/lib/notificaciones';
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

/**
 * El tap de una notificación aterriza DENTRO de la app: `destinoDeNotificacion`
 * traduce `data` (`alertaId`, `url`, `tipo`) a una ruta interna y nunca devuelve
 * una URL externa, así que el navegador no se abre desde un push. En concreto,
 * `/notificaciones` es una ruta solo de `apps/web` y cae en la pestaña de avisos.
 */
function irAUrlDeNotificacion(datos: unknown) {
  const destino = destinoDeNotificacion(datos);
  if (!destino) return;
  if (destino.clase === 'alerta') {
    router.push({ pathname: '/alertas/[id]', params: { id: destino.alertaId } });
  } else {
    router.push(destino.ruta as never);
  }
}

export default function RootLayout() {
  useEffect(() => {
    const respuestaInicial = Notifications.getLastNotificationResponse();
    if (respuestaInicial) {
      irAUrlDeNotificacion(respuestaInicial.notification.request.content.data);
    }
    const suscripcion = Notifications.addNotificationResponseReceivedListener((respuesta) => {
      irAUrlDeNotificacion(respuesta.notification.request.content.data);
    });
    return () => suscripcion.remove();
  }, []);

  return (
    <TemaProvider>
      <Aplicacion />
    </TemaProvider>
  );
}

/**
 * Botón "atrás" seguro: si la app se abrió desde una notificación (pila vacía),
 * back() no haría nada → volvemos al Inicio (lista de alertas) siempre.
 */
function volverSeguro() {
  if (router.canGoBack()) {
    router.back();
  } else {
    router.replace('/');
  }
}

function Atras({ color }: { color?: string }) {
  return (
    <Pressable
      onPress={volverSeguro}
      hitSlop={12}
      style={{ flexDirection: 'row', alignItems: 'center' }}
    >
      <Ionicons name="arrow-back" size={22} color={color ?? '#75258c'} />
    </Pressable>
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
          options={{ title: 'Nueva alerta', presentation: 'modal', headerLeft: () => <Atras /> }}
        />
        <Stack.Screen
          name="alertas/[id]"
          options={{ title: 'Alerta', headerLeft: () => <Atras /> }}
        />
      </Stack>
    </AuthProvider>
  );
}
