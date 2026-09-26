import { useCallback, useState } from 'react';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import type { AlertaResponse, NotificacionResponse } from '@mantirenfe/shared-types';
import { Etiqueta, Tarjeta } from '@/components/Tarjeta';
import { api } from '@/lib/api';
import { etiquetaEstado } from '@/lib/alertas';
import { colores, espaciado } from '@/lib/tema';

export default function DetalleAlerta() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [alerta, setAlerta] = useState<AlertaResponse | null>(null);
  const [notificaciones, setNotificaciones] = useState<NotificacionResponse[]>([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const cabecera = (
    <View style={{ gap: espaciado.sm }}>
      {error ? (
        <Tarjeta style={{ borderColor: colores.error }}>
          <Text style={{ color: colores.error }}>{error}</Text>
        </Tarjeta>
      ) : null}

      {alerta ? (
        <Tarjeta>
          <View style={estilos.fila}>
            <Text style={estilos.ruta}>
              {alerta.origenNombre} <Text style={{ color: colores.primario }}>→</Text>{' '}
              {alerta.destinoNombre}
            </Text>
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
          </View>
          <Text style={estilos.detalle}>
            {alerta.fechaViaje} · {alerta.criterio} · cada {alerta.intervaloSondeoMin} min ·{' '}
            {alerta.bono}
          </Text>
          {alerta.horaDesde || alerta.horaHasta ? (
            <Text style={estilos.detalle}>
              Franja: {alerta.horaDesde ?? '00:00'} – {alerta.horaHasta ?? '23:59'}
              {alerta.numeroTren ? ` · tren ${alerta.numeroTren}` : ''}
            </Text>
          ) : alerta.numeroTren ? (
            <Text style={estilos.detalle}>Tren {alerta.numeroTren}</Text>
          ) : null}
          <Text style={estilos.detalle}>
            Último sondeo:{' '}
            {alerta.ultimoSondeoEn
              ? new Date(alerta.ultimoSondeoEn).toLocaleString('es-ES')
              : 'todavía ninguno'}
          </Text>
        </Tarjeta>
      ) : null}

      <Text style={estilos.subtitulo}>Avisos de esta alerta</Text>
    </View>
  );

  return (
    <FlatList
      style={{ backgroundColor: colores.fondoSecundario }}
      data={notificaciones}
      keyExtractor={(item) => item.id}
      refreshControl={<RefreshControl refreshing={cargando} onRefresh={cargar} />}
      contentContainerStyle={estilos.lista}
      ListHeaderComponent={cabecera}
      ListEmptyComponent={
        cargando || error ? null : (
          <Text style={estilos.vacio}>Sin avisos todavía para esta alerta.</Text>
        )
      }
      renderItem={({ item }) => (
        <Tarjeta>
          <View style={estilos.fila}>
            <Text style={estilos.notiTitulo}>{item.titulo}</Text>
            {!item.leida ? <Etiqueta tono="primario">Nuevo</Etiqueta> : null}
          </View>
          <Text style={estilos.detalle}>{item.cuerpo}</Text>
          <Text style={estilos.fecha}>{new Date(item.creadaEn).toLocaleString('es-ES')}</Text>
        </Tarjeta>
      )}
    />
  );
}

const estilos = StyleSheet.create({
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
    color: colores.texto,
    flex: 1,
  },
  detalle: {
    fontSize: 13,
    color: colores.textoSecundario,
  },
  subtitulo: {
    fontSize: 13,
    fontWeight: '700',
    color: colores.primario,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: espaciado.xs,
  },
  notiTitulo: {
    fontSize: 15,
    fontWeight: '700',
    color: colores.texto,
    flex: 1,
  },
  fecha: {
    fontSize: 12,
    color: colores.textoSecundario,
  },
  vacio: {
    fontSize: 14,
    color: colores.textoSecundario,
    textAlign: 'center',
    paddingVertical: espaciado.lg,
  },
});
