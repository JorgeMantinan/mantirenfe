import { useCallback, useMemo, useState } from 'react';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Alert, FlatList, RefreshControl, Share, StyleSheet, Text, View } from 'react-native';
import {
  duracionCorta,
  horaGtfs,
  textoConexion,
  type AlertaResponse,
  type AvisoAlertaResponse,
  type EstadoSerializado,
  type PuntoPrecio,
} from '@mantirenfe/shared-types';
import { Boton } from '@/components/Boton';
import { Etiqueta, Tarjeta } from '@/components/Tarjeta';
import { api } from '@/lib/api';
import { etiquetaEstado } from '@/lib/alertas';
import { construirIcs } from '@/lib/ics';
import {
  agruparContagos,
  agruparPrecios,
  anchoBarra,
  consejoPrecio,
  esSeriePlana,
  formatearPrecio,
  recortarContagos,
  textoSerieCompacta,
  textoSondeosOcultos,
} from '@/lib/precios';
import { useTema } from '@/lib/tema-contexto';
import { espaciado, type Paleta } from '@/lib/tema';

/** "hace X min" si es reciente; si no, fecha legible en español. */
function haceCuanto(iso: string): string {
  const minutos = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutos < 1) return 'hace un momento';
  if (minutos < 60) return `hace ${minutos} min`;
  return new Date(iso).toLocaleString('es-ES');
}

/** "AVE · llega 09:48 · 3h48": lo que diferencia dos filas de la tabla. */
function detalleFila(tren: EstadoSerializado): string {
  return [
    tren.tipoTren,
    tren.horaLlegada ? `llega ${tren.horaLlegada}` : null,
    typeof tren.duracionMin === 'number' ? duracionCorta(tren.duracionMin) : null,
  ]
    .filter((texto): texto is string => Boolean(texto))
    .join(' · ');
}

export default function DetalleAlerta() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [alerta, setAlerta] = useState<AlertaResponse | null>(null);
  const [notificaciones, setNotificaciones] = useState<AvisoAlertaResponse[]>([]);
  const [precios, setPrecios] = useState<PuntoPrecio[]>([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { paleta } = useTema();
  const s = useMemo(() => estilos(paleta), [paleta]);

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

  const trenes = alerta?.ultimoEstado ?? [];
  const esDisponibilidad =
    alerta?.criterio === 'DISPONIBILIDAD' || alerta?.criterio === 'APERTURA_VENTA';
  const seriesPrecios = useMemo(() => agruparPrecios(precios), [precios]);
  /** Igual que en la web: la evolución se enseña en disponibilidad o si hay datos. */
  const verEvolucion = alerta?.criterio === 'DISPONIBILIDAD' || seriesPrecios.length > 0;

  const compartir = async () => {
    if (!alerta) return;
    const url = `https://mantirenfe.vercel.app/alertas/nueva?origen=${encodeURIComponent(
      alerta.origenNombre,
    )}&destino=${encodeURIComponent(alerta.destinoNombre)}&fecha=${alerta.fechaViaje}`;
    try {
      await Share.share({ message: url });
    } catch {
      Alert.alert('Compartir alerta', url);
    }
  };

  /** Comparte el `.ics` generado: en Android suele abrirlo la app de calendario. */
  const anadirAlCalendario = async () => {
    if (!alerta) return;
    try {
      await Share.share({ message: construirIcs(alerta), title: 'Añadir al calendario' });
    } catch {
      Alert.alert(
        'Añadir al calendario',
        'No se ha podido compartir el evento. Vuelve a intentarlo o entra en MantiRenfe desde el navegador para descargar el archivo .ics.',
      );
    }
  };

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
          {alerta.criterio === 'PRECIO' && alerta.precioObjetivo != null ? (
            <Text style={s.detalle}>
              Objetivo: avisar si baja de {formatearPrecio(alerta.precioObjetivo)}
            </Text>
          ) : null}
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
          <View style={s.acciones}>
            <Boton titulo="Compartir" variante="contorno" onPress={compartir} style={s.compartir} />
            <Boton
              titulo="Añadir al calendario"
              variante="contorno"
              onPress={anadirAlCalendario}
              style={s.compartir}
            />
          </View>
        </Tarjeta>
      ) : null}

      {alerta ? (
        <>
          <Text style={s.subtitulo}>Plazas de hoy</Text>
          <Tarjeta>
            {trenes.length > 0 ? (
              trenes.map((tren) => {
                const extras = detalleFila(tren);
                return (
                  <View key={`${tren.trenId}-${tren.salida}`} style={s.fila}>
                    <View style={s.plazaInfo}>
                      <Text style={s.plazaTren}>
                        {horaGtfs(tren.salida)} · {tren.numeroTren || '—'}
                      </Text>
                      {extras ? <Text style={s.detalle}>{extras}</Text> : null}
                      {tren.tramo === 'conexion' ? (
                        <Text style={s.detalle}>{textoConexion(tren)}</Text>
                      ) : null}
                      {tren.precioMin !== null ? (
                        <Text style={s.precio}>
                          Desde {formatearPrecio(tren.precioMin)}
                          {tren.tarifa ? ` · ${tren.tarifa}` : ''}
                        </Text>
                      ) : null}
                      {tren.paradasSuprimidas && tren.paradasSuprimidas.length > 0 ? (
                        <Text style={s.noPara}>
                          No para en: {tren.paradasSuprimidas.join(', ')}
                        </Text>
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
                );
              })
            ) : (
              <>
                <Text style={s.detalle}>
                  {alerta.criterio === 'PRECIO'
                    ? `Aún no hay datos de precio — se consulta cada ${alerta.intervaloSondeoMin} min`
                    : esDisponibilidad
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

      {alerta && verEvolucion ? (
        <>
          <Text style={s.subtitulo}>Evolución de precio</Text>
          <Tarjeta>
            <Text style={s.detalle}>¿Compro ahora o espero? Puntos de cada sondeo</Text>
            {seriesPrecios.length === 0 ? (
              <Text style={s.detalle}>Aún no hay evolución de precios</Text>
            ) : (
              seriesPrecios.map((serie) => {
                const plana = esSeriePlana(serie.puntos);
                const { visibles, sondeosOcultos } = recortarContagos(
                  agruparContagos(serie.puntos),
                );
                if (plana) {
                  return (
                    <Text key={serie.clave} style={s.detalle}>
                      {textoSerieCompacta(serie)}
                      {' · '}
                      <Text style={s.consejo}>{consejoPrecio(serie.puntos)}</Text>
                    </Text>
                  );
                }
                return (
                  <View key={serie.clave} style={s.serie}>
                    <View style={s.serieCabecera}>
                      <Text style={s.plazaTren}>
                        {horaGtfs(serie.salida)}
                        {serie.numeroTren ? ` · tren ${serie.numeroTren}` : ''}
                      </Text>
                      <Text style={s.fecha}>
                        {formatearPrecio(serie.minimo)} – {formatearPrecio(serie.maximo)}
                      </Text>
                    </View>
                    {visibles.map((grupo, indice) => (
                      <View key={`${grupo.registradoEn}-${indice}`} style={s.barraFila}>
                        <View style={s.barra}>
                          <View
                            style={[
                              s.barraRelleno,
                              {
                                width: `${anchoBarra(grupo.precioMin, serie.minimo, serie.maximo)}%`,
                              },
                            ]}
                          />
                        </View>
                        <View
                          style={[
                            s.puntoFinal,
                            {
                              backgroundColor: grupo.disponible
                                ? paleta.exito
                                : paleta.textoSecundario,
                            },
                          ]}
                        />
                        <Text style={s.barraPrecio}>{formatearPrecio(grupo.precioMin)}</Text>
                        <Text style={s.multiplicador}>
                          {grupo.cantidad > 1 ? `×${grupo.cantidad}` : ''}
                        </Text>
                      </View>
                    ))}
                    {sondeosOcultos > 0 ? (
                      <Text style={s.resumen}>{textoSondeosOcultos(sondeosOcultos)}</Text>
                    ) : null}
                    <Text style={s.consejo}>{consejoPrecio(serie.puntos)}</Text>
                  </View>
                );
              })
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
    acciones: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: espaciado.sm,
    },
    compartir: {
      alignSelf: 'flex-start',
      minHeight: 40,
      paddingVertical: espaciado.sm,
      paddingHorizontal: espaciado.md - 4,
    },
    vacio: {
      fontSize: 14,
      color: c.textoSecundario,
      textAlign: 'center',
      paddingVertical: espaciado.lg,
    },
    serie: {
      gap: espaciado.xs,
    },
    serieCabecera: {
      flexDirection: 'row',
      alignItems: 'baseline',
      justifyContent: 'space-between',
      gap: espaciado.sm,
    },
    barraFila: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: espaciado.sm,
    },
    barra: {
      flex: 1,
      height: 10,
      borderRadius: 5,
      backgroundColor: c.acento,
      overflow: 'hidden',
    },
    barraRelleno: {
      height: '100%',
      borderRadius: 5,
      backgroundColor: c.primario,
    },
    puntoFinal: {
      width: 8,
      height: 8,
      borderRadius: 4,
    },
    barraPrecio: {
      width: 62,
      textAlign: 'right',
      fontSize: 11,
      color: c.textoSecundario,
    },
    multiplicador: {
      width: 32,
      textAlign: 'right',
      fontSize: 11,
      fontWeight: '600',
      color: c.textoSecundario,
    },
    resumen: {
      fontSize: 11,
      color: c.textoSecundario,
    },
    consejo: {
      fontSize: 12,
      fontWeight: '600',
      color: c.aviso,
    },
  });
