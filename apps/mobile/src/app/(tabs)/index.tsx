import { useCallback, useEffect, useMemo, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { Alert, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { AlertaResponse } from '@mantirenfe/shared-types';
import { Boton } from '@/components/Boton';
import { Etiqueta, Tarjeta } from '@/components/Tarjeta';
import { api } from '@/lib/api';
import { etiquetaAvisos, etiquetaEstado } from '@/lib/alertas';
import {
  cuentaAtras,
  etiquetaDia,
  proximaSalida,
  relojPeninsular,
  textoPlazas,
  tonoPlazas,
} from '@/lib/proximoViaje';
import { useTema } from '@/lib/tema-contexto';
import { espaciado, type Paleta } from '@/lib/tema';
import { sincronizarWidget } from '@/widget/actualizarWidget';

/** Cada cuánto se re-calcula la cuenta atrás (la hora de salida no se mueve). */
const INTERVALO_CUENTA_ATRAS_MS = 60_000;

export default function Alertas() {
  const [alertas, setAlertas] = useState<AlertaResponse[]>([]);
  const [cargando, setCargando] = useState(false);
  const [listo, setListo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { paleta } = useTema();
  const s = useMemo(() => estilos(paleta), [paleta]);

  const cargar = useCallback(() => {
    setCargando(true);
    api<AlertaResponse[]>('/alertas')
      .then((datos) => {
        setAlertas(datos);
        setListo(true);
        setError(null);
        void sincronizarWidget(datos);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setCargando(false));
  }, []);

  useFocusEffect(
    useCallback(() => {
      cargar();
    }, [cargar]),
  );

  const alternar = async (alerta: AlertaResponse) => {
    const nuevo = alerta.estado === 'ACTIVA' ? 'PAUSA' : 'ACTIVA';
    try {
      await api(`/alertas/${alerta.id}`, { method: 'PATCH', json: { estado: nuevo } });
      cargar();
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'No se pudo actualizar');
    }
  };

  const eliminar = (alerta: AlertaResponse) => {
    Alert.alert('Eliminar alerta', `¿Vigilar ${alerta.origenNombre} → ${alerta.destinoNombre}?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: () => {
          void api(`/alertas/${alerta.id}`, { method: 'DELETE' })
            .then(cargar)
            .catch((e: Error) => Alert.alert('Error', e.message));
        },
      },
    ]);
  };

  return (
    <View style={s.pantalla}>
      <View style={s.encabezado}>
        <View style={s.filaEncabezado}>
          <Text style={s.titulo}>Mis alertas</Text>
          <Boton
            titulo="+ Nueva"
            onPress={() => router.push('/alertas/nueva')}
            style={s.botonNueva}
          />
        </View>
        <View style={s.accesos}>
          <Pressable
            accessibilityRole="link"
            onPress={() => router.push('/incidencias')}
            style={s.acceso}
          >
            <Ionicons name="warning-outline" size={14} color={paleta.primario} />
            <Text style={s.accesoTexto}>Incidencias</Text>
          </Pressable>
          <Pressable
            accessibilityRole="link"
            onPress={() => router.push('/suprimidos')}
            style={s.acceso}
          >
            <Ionicons name="remove-circle-outline" size={14} color={paleta.primario} />
            <Text style={s.accesoTexto}>Suprimidos</Text>
          </Pressable>
        </View>
      </View>

      {error ? (
        <Tarjeta style={{ borderColor: paleta.error }}>
          <Text style={{ color: paleta.error }}>{error}</Text>
        </Tarjeta>
      ) : null}

      <FlatList
        data={alertas}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={cargando} onRefresh={cargar} />}
        contentContainerStyle={s.lista}
        ListHeaderComponent={<TarjetaProximoViaje alertas={listo ? alertas : null} />}
        ListEmptyComponent={
          cargando ? null : (
            <View style={s.vacio}>
              <Ionicons name="notifications-off-outline" size={40} color={paleta.primario} />
              <Text style={s.vacioTitulo}>Aún no tienes alertas</Text>
              <Text style={s.vacioTexto}>
                Crea una para tu próximo viaje y te avisaremos si se libera plaza.
              </Text>
              <Boton titulo="Crear la primera" onPress={() => router.push('/alertas/nueva')} />
            </View>
          )
        }
        renderItem={({ item }) => (
          <Tarjeta>
            <View style={s.filaAlerta}>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={s.ruta}>
                  {item.origenNombre} <Text style={{ color: paleta.primario }}>→</Text>{' '}
                  {item.destinoNombre}
                </Text>
                <Text style={s.detalle}>
                  {item.fechaViaje} · cada {item.intervaloSondeoMin} min · {item.bono}
                </Text>
                <View style={s.filaAvisos}>
                  <Ionicons name="notifications-outline" size={13} color={paleta.textoSecundario} />
                  <Text style={s.avisos}>{etiquetaAvisos(item.avisosRecibidos ?? 0)}</Text>
                </View>
              </View>
              <Etiqueta
                tono={
                  item.estado === 'ACTIVA' ? 'exito' : item.estado === 'PAUSA' ? 'aviso' : 'neutro'
                }
              >
                {etiquetaEstado(item.estado)}
              </Etiqueta>
            </View>
            <View style={s.acciones}>
              <Boton
                titulo={item.estado === 'ACTIVA' ? 'Pausar' : 'Reanudar'}
                variante="contorno"
                onPress={() => void alternar(item)}
                style={s.botonAccion}
              />
              <Boton
                titulo="Editar"
                variante="contorno"
                onPress={() =>
                  router.push({ pathname: '/alertas/nueva', params: { editar: item.id } })
                }
                style={s.botonAccion}
              />
              <Boton
                titulo="Eliminar"
                variante="fantasma"
                onPress={() => eliminar(item)}
                style={s.botonAccion}
              />
            </View>
          </Tarjeta>
        )}
      />
    </View>
  );
}

/**
 * "Tu próximo viaje": la próxima salida entre las alertas ACTIVAS, con cuenta
 * atrás (re-render cada minuto) y acceso al detalle. `alertas = null` significa
 * "aún sin cargar" y no pinta nada.
 */
function TarjetaProximoViaje({ alertas }: { alertas: AlertaResponse[] | null }) {
  const [ahora, setAhora] = useState(() => new Date());
  const { paleta } = useTema();
  const s = useMemo(() => estilos(paleta), [paleta]);

  useEffect(() => {
    const id = setInterval(() => setAhora(new Date()), INTERVALO_CUENTA_ATRAS_MS);
    return () => clearInterval(id);
  }, []);

  if (alertas === null) return null;

  const salida = proximaSalida(alertas, ahora);

  if (!salida) {
    return (
      <Tarjeta>
        <Text style={s.viajeTitulo}>Tu próximo viaje</Text>
        <Text style={s.viajeVacio}>Aún no hay ninguna salida en camino</Text>
      </Tarjeta>
    );
  }

  const hoy = relojPeninsular(ahora).fecha;
  const etiqueta = etiquetaDia(salida.fecha, hoy);
  const detalles = [salida.salida ?? 'hora por confirmar'];
  if (salida.numeroTren) detalles.push(`tren ${salida.numeroTren}`);
  const linea = salida.salida ? `${etiqueta} · ${detalles.join(' · ')}` : detalles.join(' · ');

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push(`/alertas/${salida.alertaId}`)}
    >
      <Tarjeta style={{ borderColor: paleta.primario }}>
        <View style={s.viajeFila}>
          <Text style={s.viajeTitulo}>Tu próximo viaje</Text>
          <Etiqueta tono={tonoPlazas(salida.estado)}>{textoPlazas(salida)}</Etiqueta>
        </View>
        <Text style={s.viajeRuta}>
          {salida.origenNombre} <Text style={{ color: paleta.primario }}>→</Text>{' '}
          {salida.destinoNombre}
        </Text>
        <Text style={s.viajeCuenta}>
          {salida.salidaEn === null ? etiqueta : cuentaAtras(salida.salidaEn - ahora.getTime())}
        </Text>
        <Text style={s.viajeLinea}>{linea}</Text>
        {salida.estado === 'sin-datos' ? (
          <Text style={s.viajeNota}>
            Aún no sabemos las plazas: comprobamos cada {salida.intervaloSondeoMin} min
          </Text>
        ) : null}
      </Tarjeta>
    </Pressable>
  );
}

const estilos = (c: Paleta) =>
  StyleSheet.create({
    pantalla: {
      flex: 1,
      backgroundColor: c.fondoSecundario,
    },
    encabezado: {
      gap: espaciado.sm,
      paddingHorizontal: espaciado.md,
      paddingVertical: espaciado.sm,
      backgroundColor: c.fondo,
      borderBottomWidth: 1,
      borderBottomColor: c.borde,
    },
    filaEncabezado: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    accesos: {
      flexDirection: 'row',
      gap: espaciado.lg,
    },
    acceso: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingVertical: 2,
    },
    accesoTexto: {
      fontSize: 13,
      fontWeight: '600',
      color: c.primario,
    },
    titulo: {
      fontSize: 22,
      fontWeight: '800',
      color: c.texto,
    },
    botonNueva: {
      minHeight: 40,
      paddingVertical: 8,
      paddingHorizontal: 14,
    },
    lista: {
      padding: espaciado.md,
      gap: espaciado.sm,
    },
    filaAlerta: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: espaciado.sm,
    },
    ruta: {
      fontSize: 16,
      fontWeight: '700',
      color: c.texto,
    },
    detalle: {
      fontSize: 13,
      color: c.textoSecundario,
    },
    filaAvisos: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    avisos: {
      fontSize: 12,
      color: c.textoSecundario,
    },
    acciones: {
      flexDirection: 'row',
      gap: espaciado.sm,
    },
    botonAccion: {
      minHeight: 40,
      paddingVertical: 8,
      paddingHorizontal: 12,
      flex: 1,
    },
    vacio: {
      alignItems: 'center',
      gap: espaciado.sm,
      paddingVertical: espaciado.xl,
    },
    vacioTitulo: {
      fontSize: 17,
      fontWeight: '700',
      color: c.texto,
    },
    vacioTexto: {
      fontSize: 14,
      color: c.textoSecundario,
      textAlign: 'center',
      maxWidth: 280,
      marginBottom: espaciado.sm,
    },
    viajeFila: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: espaciado.sm,
    },
    viajeTitulo: {
      flex: 1,
      fontSize: 13,
      fontWeight: '700',
      color: c.primario,
    },
    viajeRuta: {
      fontSize: 18,
      fontWeight: '800',
      color: c.texto,
    },
    viajeCuenta: {
      fontSize: 30,
      fontWeight: '800',
      color: c.texto,
    },
    viajeLinea: {
      fontSize: 13,
      color: c.textoSecundario,
    },
    viajeNota: {
      fontSize: 12,
      color: c.textoSecundario,
    },
    viajeVacio: {
      fontSize: 14,
      color: c.textoSecundario,
    },
  });
