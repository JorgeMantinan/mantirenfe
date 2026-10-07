import { useCallback, useMemo, useState } from 'react';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Alert, FlatList, RefreshControl, Share, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { AlertaResponse, AvisoAlertaResponse, PuntoPrecio } from '@mantirenfe/shared-types';
import { CabeceraViaje } from '@/components/alertas/CabeceraViaje';
import { TarjetaAvisos } from '@/components/alertas/TarjetaAvisos';
import { estilosDetalle } from '@/components/alertas/estilos';
import { api } from '@/lib/api';
import { construirIcs } from '@/lib/ics';
import { agruparPrecios } from '@/lib/precios';
import { useTema } from '@/lib/tema-contexto';

export default function DetalleAlerta() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [alerta, setAlerta] = useState<AlertaResponse | null>(null);
  const [notificaciones, setNotificaciones] = useState<AvisoAlertaResponse[]>([]);
  const [precios, setPrecios] = useState<PuntoPrecio[]>([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { paleta } = useTema();
  const { t } = useTranslation();
  const s = useMemo(() => estilosDetalle(paleta), [paleta]);

  const cargar = useCallback(() => {
    if (!id) return;
    setCargando(true);
    Promise.all([
      api<AlertaResponse>(`/alertas/${id}`),
      // Histórico de avisos de ESA alerta: ya viene filtrado por la API
      api<AvisoAlertaResponse[]>(`/alertas/${id}/avisos`),
      // Histórico de precios: se pinta en la tarjeta "Evolución de precio"
      api<PuntoPrecio[]>(`/alertas/${id}/precios`).catch(() => [] as PuntoPrecio[]),
    ])
      .then(([datos, avisosDeLaAlerta, historial]) => {
        setAlerta(datos);
        setNotificaciones(avisosDeLaAlerta);
        setPrecios(historial);
        // Al abrir el detalle se marcan como leídos los avisos de esta alerta
        const sinLeer = avisosDeLaAlerta.filter((n) => !n.leida).map((n) => n.id);
        if (sinLeer.length > 0) {
          void api('/notificaciones/marcar-leidas', { method: 'PATCH', json: { ids: sinLeer } })
            .then(() => setNotificaciones(avisosDeLaAlerta.map((n) => ({ ...n, leida: true }))))
            .catch(() => undefined);
        }
        setError(null);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setCargando(false));
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      cargar();
    }, [cargar]),
  );

  const trenes = useMemo(() => alerta?.ultimoEstado ?? [], [alerta]);
  const seriesPrecios = useMemo(() => agruparPrecios(precios), [precios]);
  /** Igual que en la web: la evolución se enseña en disponibilidad, en precio o si hay datos. */
  const verEvolucion =
    alerta?.criterio === 'DISPONIBILIDAD' ||
    alerta?.criterio === 'PRECIO' ||
    seriesPrecios.length > 0;

  const compartir = useCallback(async () => {
    if (!alerta) return;
    const url = `https://mantirenfe.vercel.app/alertas/nueva?origen=${encodeURIComponent(
      alerta.origenNombre,
    )}&destino=${encodeURIComponent(alerta.destinoNombre)}&fecha=${alerta.fechaViaje}`;
    try {
      await Share.share({ message: url });
    } catch {
      Alert.alert(t('detalle.compartirTitulo'), url);
    }
  }, [alerta, t]);

  /** Comparte el `.ics` generado: en Android suele abrirlo la app de calendario. */
  const anadirAlCalendario = useCallback(async () => {
    if (!alerta) return;
    try {
      await Share.share({
        message: construirIcs(alerta),
        title: t('detalle.calendarioTitulo'),
      });
    } catch {
      Alert.alert(t('detalle.calendarioTitulo'), t('detalle.calendarioError'));
    }
  }, [alerta, t]);

  // Cabecera memoizada: al refrescar solo cambia `cargando`, y la lista no
  // debe repintar la ficha, la tabla de trenes ni la evolución de precios.
  const cabecera = useMemo(
    () => (
      <CabeceraViaje
        alerta={alerta}
        error={error}
        trenes={trenes}
        seriesPrecios={seriesPrecios}
        verEvolucion={verEvolucion}
        onCompartir={compartir}
        onCalendario={anadirAlCalendario}
      />
    ),
    [error, alerta, trenes, seriesPrecios, verEvolucion, compartir, anadirAlCalendario],
  );

  return (
    <FlatList
      style={{ backgroundColor: paleta.fondoSecundario }}
      data={notificaciones}
      keyExtractor={(item) => item.id}
      refreshControl={<RefreshControl refreshing={cargando} onRefresh={cargar} />}
      contentContainerStyle={s.lista}
      ListHeaderComponent={cabecera}
      initialNumToRender={10}
      ListEmptyComponent={
        cargando || error ? null : <Text style={s.vacio}>{t('detalle.sinAvisos')}</Text>
      }
      renderItem={({ item }) => <TarjetaAvisos aviso={item} />}
    />
  );
}
