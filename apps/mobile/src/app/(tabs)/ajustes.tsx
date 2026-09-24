import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';
import { Boton } from '@/components/Boton';
import { Tarjeta } from '@/components/Tarjeta';
import { useAuth } from '@/hooks/useAuth';
import { api } from '@/lib/api';
import { colores, espaciado } from '@/lib/tema';

export default function Ajustes() {
  const { user, salir, authConfigurada } = useAuth();
  const [push, setPush] = useState(true);
  const [recordatorio, setRecordatorio] = useState(true);
  const [guardando, setGuardando] = useState(false);

  const guardar = async (parcial: Record<string, unknown>) => {
    setGuardando(true);
    try {
      await api('/auth/preferencias', {
        method: 'POST',
        json: {
          notificacionesPush: push,
          notificacionesEmail: false,
          recordatorioSalida: recordatorio,
          minutosRecordatorio: 50,
          tema: 'sistema',
          ...parcial,
        },
      });
    } catch {
      // preferencias opcionales: no bloquear la UI
    } finally {
      setGuardando(false);
    }
  };

  const cerrarSesion = async () => {
    await salir();
    router.replace('/login');
  };

  return (
    <View style={estilos.pantalla}>
      <Text style={estilos.titulo}>Ajustes</Text>

      <Tarjeta>
        <Text style={estilos.seccion}>Cuenta</Text>
        <Text style={estilos.valor}>{user?.email ?? 'Sin sesión'}</Text>
        {!authConfigurada && (
          <Text style={estilos.aviso}>Supabase sin configurar en este entorno</Text>
        )}
      </Tarjeta>

      <Tarjeta>
        <Text style={estilos.seccion}>Notificaciones</Text>
        <View style={estilos.fila}>
          <Text style={estilos.etiqueta}>Push de disponibilidad</Text>
          <Switch
            value={push}
            onValueChange={(v) => {
              setPush(v);
              void guardar({ notificacionesPush: v });
            }}
            trackColor={{ true: colores.primarioClaro, false: colores.borde }}
            thumbColor="#fff"
          />
        </View>
        <View style={estilos.fila}>
          <Text style={estilos.etiqueta}>Recordatorio de salida (50 min)</Text>
          <Switch
            value={recordatorio}
            onValueChange={(v) => {
              setRecordatorio(v);
              void guardar({ recordatorioSalida: v });
            }}
            trackColor={{ true: colores.primarioClaro, false: colores.borde }}
            thumbColor="#fff"
          />
        </View>
        {guardando ? <Text style={estilos.pie}>Guardando...</Text> : null}
      </Tarjeta>

      <Boton
        titulo="Cerrar sesión"
        variante="destructivo"
        onPress={() => {
          void cerrarSesion();
        }}
      />
    </View>
  );
}

const estilos = StyleSheet.create({
  pantalla: {
    flex: 1,
    backgroundColor: colores.fondoSecundario,
    padding: espaciado.md,
    gap: espaciado.sm,
  },
  titulo: {
    fontSize: 22,
    fontWeight: '800',
    color: colores.texto,
    marginBottom: espaciado.xs,
  },
  seccion: {
    fontSize: 13,
    fontWeight: '700',
    color: colores.primario,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  valor: {
    fontSize: 15,
    color: colores.texto,
  },
  aviso: {
    fontSize: 13,
    color: colores.aviso,
  },
  fila: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: espaciado.sm,
    paddingVertical: 4,
  },
  etiqueta: {
    fontSize: 15,
    color: colores.texto,
    flex: 1,
  },
  pie: {
    fontSize: 12,
    color: colores.textoSecundario,
  },
});
