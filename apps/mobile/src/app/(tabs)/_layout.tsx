import { Pressable } from 'react-native';
import { Redirect, Tabs, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/hooks/useAuth';
import { useTema } from '@/lib/tema-contexto';

export default function TabsLayout() {
  const { user, cargando } = useAuth();
  const { paleta } = useTema();
  const { t } = useTranslation();

  if (cargando) return null;
  if (!user) return <Redirect href="/login" />;

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: paleta.primario,
        tabBarInactiveTintColor: paleta.textoSecundario,
        headerStyle: { backgroundColor: paleta.fondo },
        headerTintColor: paleta.texto,
        headerTitleStyle: { fontWeight: '700' },
        tabBarStyle: { backgroundColor: paleta.fondo, borderTopColor: paleta.borde },
        // Ajustes también siempre visible arriba a la derecha, en cualquier pestaña
        headerRight: () => (
          <Pressable
            onPress={() => router.push('/ajustes')}
            style={{ marginRight: 16, padding: 4 }}
            accessibilityRole="button"
            accessibilityLabel={t('pestanas.ajustes')}
          >
            <Ionicons name="settings-outline" size={22} color={paleta.texto} />
          </Pressable>
        ),
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t('pestanas.alertas'),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="notifications-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="trenes"
        options={{
          title: t('pestanas.trenes'),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="train-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="avisos"
        options={{
          title: t('pestanas.avisos'),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="mail-outline" size={size} color={color} />
          ),
        }}
      />
      {/* Ajustes vive en el icono de la cabecera; su sitio en la barra lo
          ocupa «Buscar mi tren», el buscador de horarios con precios */}
      <Tabs.Screen
        name="buscar"
        options={{
          title: t('trenes.buscarMiTren'),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="search-outline" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
