import { useCallback, useMemo, useState } from 'react';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Alert, FlatList, RefreshControl, Share, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
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
import { locale } from '@/i18n';
import { api } from '@/lib/api';
import { etiquetaCriterio, etiquetaEstado } from '@/lib/alertas';
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

/** Traductor que usan los ayudantes de este módulo (se pasa desde el render). */
type Traductor = ReturnType<typeof useTranslation>['t'];

/** "hace X min" si es reciente; si no, fecha legible en el idioma activo. */
function haceCuanto(iso: string, t: Traductor): string {
  const minutos = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutos < 1) return t('detalle.haceMomento');
  if (minutos < 60) return t('detalle.haceMin', { min: minutos });
  return new Date(iso).toLocaleString(locale());
}

/**
 * Mensaje de la tarjeta de estado cuando `ultimoEstado` no tiene filas.
 *
 * Con criterio RETRASO el estado vacío no significa «no hay trenes»: significa
 * que ninguno va con retraso ahora mismo, así que se avisa en esos términos
 * (y se distingue de «todavía no se ha sondeado»). El resto de criterios
 * mantienen su mensaje habitual.
 */
function mensajeEstadoVacio(alerta: AlertaResponse, t: Traductor): string {
  const franja =
    alerta.horaDesde || alerta.horaHasta
      ? `${alerta.horaDesde ?? '00:00'}–${alerta.horaHasta ?? '23:59'}`
      : null;
  if (alerta.criterio === 'RETRASO') {
    if (!alerta.ultimoSondeoEn) {
      return t('detalle.sinSondeo', { min: alerta.intervaloSondeoMin });
    }
    const donde = franja ? t('detalle.enFranja', { franja }) : t('detalle.enRuta');
    // N solo es conocible si se vigila un tren concreto
    const vigilancia = alerta.numeroTren ? t('detalle.vigilamos1') : '';
    return t('detalle.sinRetrasos', { donde, vigilancia });
  }
  if (alerta.criterio === 'PRECIO') {
    return t('detalle.sinPrecio', { min: alerta.intervaloSondeoMin });
  }
  if (alerta.criterio === 'DISPONIBILIDAD' || alerta.criterio === 'APERTURA_VENTA') {
    return t('detalle.sinPlazas', { min: alerta.intervaloSondeoMin });
  }
  return t('detalle.soloDisponibilidad');
}

/** "AVE · llega 09:48 · 3h48": lo que diferencia dos filas de la tabla. */
function detalleFila(tren: EstadoSerializado, t: Traductor): string {
  return [
    tren.tipoTren,
    tren.horaLlegada ? t('detalle.llega', { hora: tren.horaLlegada }) : null,
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
  const { t } = useTranslation();
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
  const seriesPrecios = useMemo(() => agruparPrecios(precios), [precios]);
  /** Igual que en la web: la evolución se enseña en disponibilidad, en precio o si hay datos. */
  const verEvolucion =
    alerta?.criterio === 'DISPONIBILIDAD' ||
    alerta?.criterio === 'PRECIO' ||
    seriesPrecios.length > 0;

  const compartir = async () => {
    if (!alerta) return;
    const url = `https://mantirenfe.vercel.app/alertas/nueva?origen=${encodeURIComponent(
      alerta.origenNombre,
    )}&destino=${encodeURIComponent(alerta.destinoNombre)}&fecha=${alerta.fechaViaje}`;
    try {
      await Share.share({ message: url });
    } catch {
      Alert.alert(t('detalle.compartirTitulo'), url);
    }
  };

  /** Comparte el `.ics` generado: en Android suele abrirlo la app de calendario. */
  const anadirAlCalendario = async () => {
    if (!alerta) return;
    try {
      await Share.share({
        message: construirIcs(alerta),
        title: t('detalle.calendarioTitulo'),
      });
    } catch {
      Alert.alert(t('detalle.calendarioTitulo'), t('detalle.calendarioError'));
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
                  {alerta.soloLaborables ? t('detalle.laborables') : t('detalle.cadaDia')}
                </Etiqueta>
              ) : null}
            </View>
          </View>
          <Text style={s.detalle}>
            {t('detalle.metaAlerta', {
              fecha: alerta.fechaViaje,
              criterio: etiquetaCriterio(alerta.criterio),
              min: alerta.intervaloSondeoMin,
              bono: alerta.bono,
            })}
          </Text>
          {alerta.criterio === 'PRECIO' && alerta.precioObjetivo != null ? (
            <Text style={s.detalle}>
              {t('detalle.objetivo', { precio: formatearPrecio(alerta.precioObjetivo) })}
            </Text>
          ) : null}
          {alerta.horaDesde || alerta.horaHasta ? (
            <Text style={s.detalle}>
              {t('detalle.franja', {
                desde: alerta.horaDesde ?? '00:00',
                hasta: alerta.horaHasta ?? '23:59',
              })}
              {alerta.numeroTren ? t('detalle.trenSufijo', { tren: alerta.numeroTren }) : ''}
            </Text>
          ) : alerta.numeroTren ? (
            <Text style={s.detalle}>{t('detalle.tren', { tren: alerta.numeroTren })}</Text>
          ) : null}
          <Text style={s.detalle}>
            {t('detalle.ultimoSondeo', {
              valor: alerta.ultimoSondeoEn
                ? new Date(alerta.ultimoSondeoEn).toLocaleString(locale())
                : t('detalle.ninguno'),
            })}
          </Text>
          <View style={s.acciones}>
            <Boton
              titulo={t('comunes.compartir')}
              variante="contorno"
              onPress={compartir}
              style={s.compartir}
            />
            <Boton
              titulo={t('detalle.calendarioTitulo')}
              variante="contorno"
              onPress={anadirAlCalendario}
              style={s.compartir}
            />
          </View>
        </Tarjeta>
      ) : null}

      {alerta ? (
        <>
          <Text style={s.subtitulo}>
            {alerta.criterio === 'RETRASO' ? t('detalle.hoyRetrasos') : t('detalle.hoyPlazas')}
          </Text>
          <Tarjeta>
            {trenes.length > 0 ? (
              trenes.map((tren) => {
                const extras = detalleFila(tren, t);
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
                          {t('detalle.desde', { precio: formatearPrecio(tren.precioMin) })}
                          {tren.tarifa ? ` · ${tren.tarifa}` : ''}
                        </Text>
                      ) : null}
                      {tren.paradasSuprimidas && tren.paradasSuprimidas.length > 0 ? (
                        <Text style={s.noPara}>
                          {t('detalle.noPara', { lista: tren.paradasSuprimidas.join(', ') })}
                        </Text>
                      ) : null}
                    </View>
                    {tren.cancelado ? (
                      <Etiqueta tono="error">{t('comunes.cancelado')}</Etiqueta>
                    ) : (
                      <Etiqueta tono={tren.disponible ? 'exito' : 'neutro'}>
                        {tren.disponible ? t('comunes.hayPlazas') : t('comunes.completo')}
                      </Etiqueta>
                    )}
                  </View>
                );
              })
            ) : (
              <>
                <Text style={s.detalle}>{mensajeEstadoVacio(alerta, t)}</Text>
                {alerta.ultimoSondeoEn ? (
                  <Text style={s.fecha}>
                    {t('detalle.ultimoSondeo', { valor: haceCuanto(alerta.ultimoSondeoEn, t) })}
                  </Text>
                ) : null}
              </>
            )}
          </Tarjeta>
        </>
      ) : null}

      {alerta && verEvolucion ? (
        <>
          <Text style={s.subtitulo}>{t('detalle.evolucionTitulo')}</Text>
          <Tarjeta>
            <Text style={s.detalle}>{t('detalle.evolucionSubtitulo')}</Text>
            {seriesPrecios.length === 0 ? (
              <Text style={s.detalle}>{t('detalle.sinEvolucion')}</Text>
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
                        {serie.numeroTren
                          ? t('detalle.trenSufijo', { tren: serie.numeroTren })
                          : ''}
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

      <Text style={s.subtitulo}>{t('detalle.avisosTitulo')}</Text>
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
        cargando || error ? null : <Text style={s.vacio}>{t('detalle.sinAvisos')}</Text>
      }
      renderItem={({ item }) => (
        <Tarjeta>
          <View style={s.fila}>
            <Text style={s.notiTitulo}>{item.titulo}</Text>
            {!item.leida ? <Etiqueta tono="primario">{t('comunes.nuevo')}</Etiqueta> : null}
          </View>
          <Text style={s.detalle}>{item.cuerpo}</Text>
          <Text style={s.fecha}>{new Date(item.creadaEn).toLocaleString(locale())}</Text>
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
