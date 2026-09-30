import { useCallback, useEffect, useMemo, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { Alert, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import type { AlertaResponse } from '@mantirenfe/shared-types';
import { Boton } from '@/components/Boton';
import { Etiqueta, Tarjeta } from '@/components/Tarjeta';
import { api } from '@/lib/api';
import { etiquetaAvisos, etiquetaEstado } from '@/lib/alertas';
import {
  cuentaAtras,
  etiquetaDia,
  proximasSalidas,
  relojPeninsular,
  textoPlazas,
  tonoPlazas,
  type EstadoPlazas,
  type ProximaSalida,
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
  const { t } = useTranslation();
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
      Alert.alert(
        t('comunes.error'),
        e instanceof Error ? e.message : t('comunes.errorActualizar'),
      );
    }
  };

  const eliminar = (alerta: AlertaResponse) => {
    Alert.alert(
      t('lista.eliminarTitulo'),
      t('lista.eliminarCuerpo', {
        origen: alerta.origenNombre,
        destino: alerta.destinoNombre,
      }),
      [
        { text: t('comunes.cancelar'), style: 'cancel' },
        {
          text: t('comunes.eliminar'),
          style: 'destructive',
          onPress: () => {
            void api(`/alertas/${alerta.id}`, { method: 'DELETE' })
              .then(cargar)
              .catch((e: Error) => Alert.alert(t('comunes.error'), e.message));
          },
        },
      ],
    );
  };

  return (
    <View style={s.pantalla}>
      <View style={s.encabezado}>
        <View style={s.filaEncabezado}>
          <Text style={s.titulo}>{t('lista.titulo')}</Text>
          <Boton
            titulo={t('lista.nueva')}
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
            <Text style={s.accesoTexto}>{t('comunes.incidencias')}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="link"
            onPress={() => router.push('/suprimidos')}
            style={s.acceso}
          >
            <Ionicons name="remove-circle-outline" size={14} color={paleta.primario} />
            <Text style={s.accesoTexto}>{t('comunes.suprimidos')}</Text>
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
              <Text style={s.vacioTitulo}>{t('lista.vacioTitulo')}</Text>
              <Text style={s.vacioTexto}>{t('lista.vacioTexto')}</Text>
              <Boton
                titulo={t('lista.crearPrimera')}
                onPress={() => router.push('/alertas/nueva')}
              />
            </View>
          )
        }
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('lista.a11yVer', {
              origen: item.origenNombre,
              destino: item.destinoNombre,
            })}
            accessibilityHint={t('lista.a11yPista')}
            onPress={() => router.push(`/alertas/${item.id}`)}
            style={({ pressed }) => ({ opacity: pressed ? 0.9 : 1 })}
          >
            <Tarjeta>
              <View style={s.filaAlerta}>
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={s.ruta}>
                    {item.origenNombre} <Text style={{ color: paleta.primario }}>→</Text>{' '}
                    {item.destinoNombre}
                  </Text>
                  <Text style={s.detalle}>
                    {t('lista.metaAlerta', {
                      fecha: item.fechaViaje,
                      min: item.intervaloSondeoMin,
                      bono: item.bono,
                    })}
                  </Text>
                  <View style={s.filaAvisos}>
                    <Ionicons
                      name="notifications-outline"
                      size={13}
                      color={paleta.textoSecundario}
                    />
                    <Text style={s.avisos}>{etiquetaAvisos(item.avisosRecibidos ?? 0)}</Text>
                  </View>
                </View>
                <View style={s.filaDerecha}>
                  <Etiqueta
                    tono={
                      item.estado === 'ACTIVA'
                        ? 'exito'
                        : item.estado === 'PAUSA'
                          ? 'aviso'
                          : 'neutro'
                    }
                  >
                    {etiquetaEstado(item.estado)}
                  </Etiqueta>
                  <Ionicons name="chevron-forward" size={16} color={paleta.textoSecundario} />
                </View>
              </View>
              <View style={s.acciones}>
                <Boton
                  titulo={item.estado === 'ACTIVA' ? t('lista.pausar') : t('lista.reanudar')}
                  variante="contorno"
                  onPress={() => void alternar(item)}
                  style={s.botonAccion}
                />
                <Boton
                  titulo={t('comunes.editar')}
                  variante="contorno"
                  onPress={() =>
                    router.push({ pathname: '/alertas/nueva', params: { editar: item.id } })
                  }
                  style={s.botonAccion}
                />
                <Boton
                  titulo={t('comunes.eliminar')}
                  variante="fantasma"
                  onPress={() => eliminar(item)}
                  style={s.botonAccion}
                />
              </View>
            </Tarjeta>
          </Pressable>
        )}
      />
    </View>
  );
}

/** Cuántas salidas enseña la tarjeta: la próxima + dos filas compactas. */
const MAXIMO_SALIDAS = 3;

/**
 * Inicio de una fila compacta: "08:00" si sale hoy, "Mañana 08:00" si cae otro
 * día y solo la etiqueta del día cuando aún no hay hora confirmada.
 */
function inicioFila(salida: ProximaSalida, hoy: string): string {
  const etiqueta = etiquetaDia(salida.fecha, hoy);
  if (!salida.salida) return etiqueta;
  return salida.fecha === hoy ? salida.salida : `${etiqueta} ${salida.salida}`;
}

/**
 * "Tu próximo viaje": la próxima salida entre las alertas ACTIVAS, con cuenta
 * atrás (re-render cada minuto) y acceso al detalle; debajo, hasta dos filas
 * compactas con las salidas siguientes de otras alertas (cada una lleva a su
 * propio detalle). `alertas = null` significa "aún sin cargar" y no pinta nada.
 */
function TarjetaProximoViaje({ alertas }: { alertas: AlertaResponse[] | null }) {
  const [ahora, setAhora] = useState(() => new Date());
  const { paleta } = useTema();
  const { t } = useTranslation();
  const s = useMemo(() => estilos(paleta), [paleta]);

  /** Badge corto de las filas compactas: "Plazas" en vez de "Hay plazas desde …". */
  const textoPlazasCorto = (estado: EstadoPlazas): string => {
    switch (estado) {
      case 'cancelado':
        return t('comunes.cancelado');
      case 'plazas':
        return t('comunes.plazas');
      case 'completo':
        return t('comunes.completo');
      default:
        return t('comunes.sinDatos');
    }
  };

  useEffect(() => {
    const id = setInterval(() => setAhora(new Date()), INTERVALO_CUENTA_ATRAS_MS);
    return () => clearInterval(id);
  }, []);

  if (alertas === null) return null;

  const salidas = proximasSalidas(alertas, MAXIMO_SALIDAS, ahora);
  const salida = salidas[0];
  const siguientes = salidas.slice(1);

  if (!salida) {
    return (
      <Tarjeta>
        <Text style={s.viajeTitulo}>{t('viaje.titulo')}</Text>
        <Text style={s.viajeVacio}>{t('viaje.vacio')}</Text>
      </Tarjeta>
    );
  }

  const hoy = relojPeninsular(ahora).fecha;
  const etiqueta = etiquetaDia(salida.fecha, hoy);
  const detalles = [salida.salida ?? t('viaje.horaPorConfirmar')];
  if (salida.numeroTren) detalles.push(t('viaje.tren', { tren: salida.numeroTren }));
  const linea = salida.salida ? `${etiqueta} · ${detalles.join(' · ')}` : detalles.join(' · ');

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('viaje.a11yRuta', {
        origen: salida.origenNombre,
        destino: salida.destinoNombre,
      })}
      accessibilityHint={t('viaje.a11yPista')}
      onPress={() => router.push(`/alertas/${salida.alertaId}`)}
      style={({ pressed }) => ({ opacity: pressed ? 0.9 : 1 })}
    >
      <Tarjeta style={{ borderColor: paleta.primario }}>
        <View style={s.viajeFila}>
          <Text style={s.viajeTitulo}>{t('viaje.titulo')}</Text>
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
            {t('viaje.sinPlazas', { min: salida.intervaloSondeoMin })}
          </Text>
        ) : null}
        {siguientes.length > 0 ? (
          <View style={s.viajeSiguientes}>
            <View style={s.viajeSeparador} />
            <Text style={s.viajeSiguientesTitulo}>{t('viaje.tambien')}</Text>
            {siguientes.map((siguiente) => (
              <Pressable
                key={siguiente.alertaId}
                accessibilityRole="button"
                accessibilityLabel={t('viaje.a11yFila', {
                  fila: inicioFila(siguiente, hoy),
                  origen: siguiente.origenNombre,
                  destino: siguiente.destinoNombre,
                })}
                accessibilityHint={t('viaje.a11yPista')}
                onPress={() => router.push(`/alertas/${siguiente.alertaId}`)}
                style={({ pressed }) => [s.viajeSiguienteFila, { opacity: pressed ? 0.6 : 1 }]}
              >
                <Text style={s.viajeSiguienteTexto}>
                  {inicioFila(siguiente, hoy)} · {siguiente.origenNombre}{' '}
                  <Text style={{ color: paleta.primario }}>→</Text> {siguiente.destinoNombre}
                </Text>
                <Etiqueta tono={tonoPlazas(siguiente.estado)} style={s.viajeSiguienteBadge}>
                  {textoPlazasCorto(siguiente.estado)}
                </Etiqueta>
              </Pressable>
            ))}
          </View>
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
    filaDerecha: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
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
    viajeSiguientes: {
      gap: espaciado.xs,
    },
    viajeSeparador: {
      height: 1,
      backgroundColor: c.borde,
    },
    viajeSiguientesTitulo: {
      fontSize: 12,
      fontWeight: '700',
      color: c.textoSecundario,
    },
    viajeSiguienteFila: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: espaciado.sm,
      paddingVertical: 6,
    },
    viajeSiguienteTexto: {
      flex: 1,
      fontSize: 14,
      fontWeight: '600',
      color: c.texto,
    },
    viajeSiguienteBadge: {
      paddingVertical: 2,
      paddingHorizontal: 8,
    },
  });
