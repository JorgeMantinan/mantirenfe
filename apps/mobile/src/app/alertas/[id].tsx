import { useCallback, useMemo, useState } from 'react';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { horaGtfs, type AlertaResponse, type NotificacionResponse } from '@mantirenfe/shared-types';
import { Etiqueta, Tarjeta } from '@/components/Tarjeta';
import { api } from '@/lib/api';
import { etiquetaEstado } from '@/lib/alertas';
import { useTema } from '@/lib/tema-contexto';
import { espaciado, type Paleta } from '@/lib/tema';

/** "hace X min" si es reciente; si no, fecha legible en español. */
function haceCuanto(iso: string): string {
  const minutos = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutos < 1) return 'hace un momento';
  if (minutos < 60) return `hace ${minutos} min`;
  return new Date(iso).toLocaleString('es-ES');
}

function formatearPrecio(precioMin: number | null): string {
  if (precioMin === null) return '—';
  return precioMin.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
}

export default function DetalleAlerta() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [alerta, setAlerta] = useState<AlertaResponse | null>(null);
  const [notificaciones, setNotificaciones] = useState<NotificacionResponse[]>([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { paleta } = useTema();
  const s = useMemo(() => estilos(paleta), [paleta]);

  const cargar = useCallback(() => {
    if (!id) return;
    setCargando(true);
    Promise.all([
      api<AlertaResponse>(`/alertas/${id}`),
      api<NotificacionResponse[]>('/notificaciones'),
    ])
      .then(([datos, todas]) => {
        setAlerta(datos);
        const deEstaAlerta = todas.filter((n) => n.alertaId === id);
        setNotificaciones(deEstaAlerta);
        // Al abrir el detalle se marcan como leídos los avisos de esta alerta
        const sinLeer = deEstaAlerta.filter((n) => !n.leida).map((n) => n.id);
        if (sinLeer.length > 0) {
          void api('/notificaciones/marcar-leidas', { method: 'PATCH', json: { ids: sinLeer } })
            .then(() => setNotificaciones(deEstaAlerta.map((n) => ({ ...n, leida: true }))))
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

  const trenes = alerta?.ultimoEstado ?? [];
  const esDisponibilidad =
    alerta?.criterio === 'DISPONIBILIDAD' || alerta?.criterio === 'APERTURA_VENTA';

  const cabecera = (
    <View style={{ gap: espaciado.sm }}>
      {error ? (
        <Tarjeta style={{ borderColor: paleta.error }}>
          <Text style={{ color: paleta.error }}>{error}</Text>
        </Tarjeta>
      ) : null}

      {alerta ? (
        <Tarjeta>
          <View style={s.fila}>
            <Text style={s.ruta}>
              {alerta.origenNombre} <Text style={{ color: paleta.primario }}>→</Text>{' '}
              {alerta.destinoNombre}
            </Text>
            <View style={s.etiquetas}>
              <Etiqueta
                tono={
                  alerta.estado === 'ACTIVA'
                    ? 'exito'
                    : alerta.estado === 'PAUSA'
                      ? 'aviso'
                      : 'neutro'
                }
              >
                {etiquetaEstado(alerta.estado)}
              </Etiqueta>
              {alerta.recurrente ? (
                <Etiqueta tono="primario">
                  {alerta.soloLaborables ? 'L-V: Cada día laborable' : 'Cada día'}
                </Etiqueta>
              ) : null}
            </View>
          </View>
          <Text style={s.detalle}>
            {alerta.fechaViaje} · {alerta.criterio} · cada {alerta.intervaloSondeoMin} min ·{' '}
            {alerta.bono}
          </Text>
          {alerta.horaDesde || alerta.horaHasta ? (
            <Text style={s.detalle}>
              Franja: {alerta.horaDesde ?? '00:00'} – {alerta.horaHasta ?? '23:59'}
              {alerta.numeroTren ? ` · tren ${alerta.numeroTren}` : ''}
            </Text>
          ) : alerta.numeroTren ? (
            <Text style={s.detalle}>Tren {alerta.numeroTren}</Text>
          ) : null}
          <Text style={s.detalle}>
            Último sondeo:{' '}
            {alerta.ultimoSondeoEn
              ? new Date(alerta.ultimoSondeoEn).toLocaleString('es-ES')
              : 'todavía ninguno'}
          </Text>
        </Tarjeta>
      ) : null}

      {alerta ? (
        <>
          <Text style={s.subtitulo}>Plazas de hoy</Text>
          <Tarjeta>
            {trenes.length > 0 ? (
              trenes.map((tren) => (
                <View key={`${tren.trenId}-${tren.salida}`} style={s.fila}>
                  <View style={s.plazaInfo}>
                    <Text style={s.plazaTren}>
                      {horaGtfs(tren.salida)} · {tren.numeroTren || '—'}
                    </Text>
                    {tren.precioMin !== null ? (
                      <Text style={s.precio}>Desde {formatearPrecio(tren.precioMin)}</Text>
                    ) : null}
                    {tren.paradasSuprimidas && tren.paradasSuprimidas.length > 0 ? (
                      <Text style={s.noPara}>No para en: {tren.paradasSuprimidas.join(', ')}</Text>
                    ) : null}
                  </View>
                  {tren.cancelado ? (
                    <Etiqueta tono="error">Cancelado</Etiqueta>
                  ) : (
                    <Etiqueta tono={tren.disponible ? 'exito' : 'neutro'}>
                      {tren.disponible ? 'Hay plazas' : 'Completo'}
                    </Etiqueta>
                  )}
                </View>
              ))
            ) : (
              <>
                <Text style={s.detalle}>
                  {esDisponibilidad
                    ? `Aún no hay datos de plazas — se consulta cada ${alerta.intervaloSondeoMin} min`
                    : 'Solo para alertas de disponibilidad'}
                </Text>
                {alerta.ultimoSondeoEn ? (
                  <Text style={s.fecha}>Último sondeo: {haceCuanto(alerta.ultimoSondeoEn)}</Text>
                ) : null}
              </>
            )}
          </Tarjeta>
        </>
      ) : null}

      <Text style={s.subtitulo}>Avisos de esta alerta</Text>
    </View>
  );

  return (
    <FlatList
      style={{ backgroundColor: paleta.fondoSecundario }}
      data={notificaciones}
      keyExtractor={(item) => item.id}
      refreshControl={<RefreshControl refreshing={cargando} onRefresh={cargar} />}
      contentContainerStyle={s.lista}
      ListHeaderComponent={cabecera}
      ListEmptyComponent={
        cargando || error ? null : <Text style={s.vacio}>Sin avisos todavía para esta alerta.</Text>
      }
      renderItem={({ item }) => (
        <Tarjeta>
          <View style={s.fila}>
            <Text style={s.notiTitulo}>{item.titulo}</Text>
            {!item.leida ? <Etiqueta tono="primario">Nuevo</Etiqueta> : null}
          </View>
          <Text style={s.detalle}>{item.cuerpo}</Text>
          <Text style={s.fecha}>{new Date(item.creadaEn).toLocaleString('es-ES')}</Text>
        </Tarjeta>
      )}
    />
  );
}

const estilos = (c: Paleta) =>
  StyleSheet.create({
    lista: {
      padding: espaciado.md,
      gap: espaciado.sm,
    },
    fila: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: espaciado.sm,
    },
    ruta: {
      fontSize: 16,
      fontWeight: '700',
      color: c.texto,
      flex: 1,
    },
    etiquetas: {
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: espaciado.xs,
      justifyContent: 'flex-end',
      maxWidth: '55%',
    },
    detalle: {
      fontSize: 13,
      color: c.textoSecundario,
    },
    subtitulo: {
      fontSize: 13,
      fontWeight: '700',
      color: c.primario,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginTop: espaciado.xs,
    },
    notiTitulo: {
      fontSize: 15,
      fontWeight: '700',
      color: c.texto,
      flex: 1,
    },
    plazaInfo: {
      flex: 1,
      gap: 2,
    },
    plazaTren: {
      fontSize: 15,
      fontWeight: '700',
      color: c.texto,
    },
    precio: {
      fontSize: 13,
      fontWeight: '600',
      color: c.aviso,
    },
    noPara: {
      fontSize: 13,
      fontWeight: '600',
      color: c.aviso,
    },
    fecha: {
      fontSize: 12,
      color: c.textoSecundario,
    },
    vacio: {
      fontSize: 14,
      color: c.textoSecundario,
      textAlign: 'center',
      paddingVertical: espaciado.lg,
    },
  });
