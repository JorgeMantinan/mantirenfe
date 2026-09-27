import { Redirect, Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/hooks/useAuth';
import { useTema } from '@/lib/tema-contexto';

export default function TabsLayout() {
  const { user, cargando } = useAuth();
  const { paleta } = useTema();

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
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Alertas',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="notifications-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="trenes"
        options={{
          title: 'Trenes',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="train-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="avisos"
        options={{
          title: 'Avisos',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="mail-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="ajustes"
        options={{
          title: 'Ajustes',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="settings-outline" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
