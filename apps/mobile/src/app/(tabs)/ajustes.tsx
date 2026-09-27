import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';
import type { PreferenciasUsuario } from '@mantirenfe/shared-types';
import { Boton } from '@/components/Boton';
import { Tarjeta } from '@/components/Tarjeta';
import { useAuth } from '@/hooks/useAuth';
import { api } from '@/lib/api';
import { desregistrarPushMovil, registrarPushMovil } from '@/lib/push';
import { useTema, type ModoTema } from '@/lib/tema-contexto';
import { espaciado, radio, type Paleta } from '@/lib/tema';

const MODOS_TEMA: Array<[ModoTema, string]> = [
  ['claro', 'Claro'],
  ['oscuro', 'Oscuro'],
  ['sistema', 'Sistema'],
];

export default function Ajustes() {
  const { user, salir, authConfigurada } = useAuth();
  const { modo, setModo, paleta } = useTema();
  const [pref, setPref] = useState<PreferenciasUsuario | null>(null);
  const [push, setPush] = useState(true);
  const [recordatorio, setRecordatorio] = useState(true);
  const [resumen, setResumen] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [estadoPush, setEstadoPush] = useState<string | null>(null);
  const s = useMemo(() => estilos(paleta), [paleta]);

  useEffect(() => {
    if (!authConfigurada) return;
    api<PreferenciasUsuario>('/auth/preferencias')
      .then((p) => {
        setPref(p);
        setPush(p.notificacionesPush);
        setRecordatorio(p.recordatorioSalida);
        setResumen(p.resumenViaje);
      })
      .catch(() => {
        // sin preferencias guardadas: se mantienen los valores por defecto
      });
  }, [authConfigurada]);

  const cambiarPush = async (activo: boolean) => {
    setPush(activo);
    const resultado = activo ? await registrarPushMovil() : await desregistrarPushMovil();
    setEstadoPush(
      resultado.ok
        ? activo
          ? 'Avisos push activados en este dispositivo'
          : 'Avisos push desactivados en este dispositivo'
        : (resultado.error ?? 'No se pudo actualizar el registro push'),
    );
    if (!resultado.ok && activo) setPush(false);
    void guardar({ notificacionesPush: activo && resultado.ok });
  };

  const guardar = async (parcial: Partial<PreferenciasUsuario>) => {
    setGuardando(true);
    try {
      const siguiente = { ...(pref ?? {}), ...parcial, tema: modo } as PreferenciasUsuario;
      const guardado = await api<PreferenciasUsuario>('/auth/preferencias', {
        method: 'POST',
        json: siguiente,
      });
      setPref(guardado);
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
    <View style={s.pantalla}>
      <Text style={s.titulo}>Ajustes</Text>

      <Tarjeta>
        <Text style={s.seccion}>Cuenta</Text>
        <Text style={s.valor}>{user?.email ?? 'Sin sesión'}</Text>
        {!authConfigurada && <Text style={s.aviso}>Supabase sin configurar en este entorno</Text>}
      </Tarjeta>

      <Tarjeta>
        <Text style={s.seccion}>Apariencia</Text>
        <View style={s.modos}>
          {MODOS_TEMA.map(([valor, etiqueta]) => (
            <Text
              key={valor}
              style={[s.modo, modo === valor && s.modoActivo]}
              onPress={() => setModo(valor)}
            >
              {etiqueta}
            </Text>
          ))}
        </View>
      </Tarjeta>

      <Tarjeta>
        <Text style={s.seccion}>Notificaciones</Text>
        <View style={s.fila}>
          <Text style={s.etiqueta}>Push de disponibilidad</Text>
          <Switch
            value={push}
            onValueChange={(v) => {
              void cambiarPush(v);
            }}
            trackColor={{ true: paleta.primarioClaro, false: paleta.borde }}
            thumbColor="#fff"
          />
        </View>
        {estadoPush ? <Text style={s.pie}>{estadoPush}</Text> : null}
        <View style={s.fila}>
          <Text style={s.etiqueta}>Recordatorio de salida (50 min)</Text>
          <Switch
            value={recordatorio}
            onValueChange={(v) => {
              setRecordatorio(v);
              void guardar({ recordatorioSalida: v });
            }}
            trackColor={{ true: paleta.primarioClaro, false: paleta.borde }}
            thumbColor="#fff"
          />
        </View>
        <View style={s.fila}>
          <Text style={s.etiqueta}>Resumen del viaje (mañana del día)</Text>
          <Switch
            value={resumen}
            onValueChange={(v) => {
              setResumen(v);
              void guardar({ resumenViaje: v });
            }}
            trackColor={{ true: paleta.primarioClaro, false: paleta.borde }}
            thumbColor="#fff"
          />
        </View>
        {guardando ? <Text style={s.pie}>Guardando...</Text> : null}
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

const estilos = (c: Paleta) =>
  StyleSheet.create({
    pantalla: {
      flex: 1,
      backgroundColor: c.fondoSecundario,
      padding: espaciado.md,
      gap: espaciado.sm,
    },
    titulo: {
      fontSize: 22,
      fontWeight: '800',
      color: c.texto,
      marginBottom: espaciado.xs,
    },
    seccion: {
      fontSize: 13,
      fontWeight: '700',
      color: c.primario,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    valor: {
      fontSize: 15,
      color: c.texto,
    },
    aviso: {
      fontSize: 13,
      color: c.aviso,
    },
    modos: {
      flexDirection: 'row',
      gap: espaciado.sm,
      paddingTop: espaciado.xs,
    },
    modo: {
      fontSize: 13,
      fontWeight: '600',
      color: c.textoSecundario,
      borderWidth: 1,
      borderColor: c.borde,
      borderRadius: radio.completo,
      paddingHorizontal: 12,
      paddingVertical: 6,
      overflow: 'hidden',
    },
    modoActivo: {
      color: c.primarioOscuro,
      borderColor: c.primario,
      backgroundColor: c.acento,
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
      color: c.texto,
      flex: 1,
    },
    pie: {
      fontSize: 12,
      color: c.textoSecundario,
    },
  });
