import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { Alert, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import type { AlertaResponse, EstadisticasResponse } from '@mantirenfe/shared-types';
import { TIPO_AVISO_SIN_TIPO } from '@mantirenfe/shared-types';
import { Boton } from '@/components/Boton';
import { Etiqueta, Tarjeta } from '@/components/Tarjeta';
import { criteriosDeAlerta } from '@/components/alertas/FichaAlerta';
import { api } from '@/lib/api';
import {
  etiquetaAvisos,
  etiquetaCriterio,
  etiquetaDiasSemana,
  etiquetaEstado,
} from '@/lib/alertas';
import { formatearPrecio } from '@/lib/precios';
import {
  contenidoLista,
  fondoPantalla,
  meta,
  nombre,
  pista,
  tituloPantalla,
  vacioContenedor,
  vacioTitulo,
} from '@/lib/estilos-comunes';
import {
  cuentaAtras,
  etiquetaDia,
  fechaCorta,
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

  // `cancelado` evita setState tras desmontar; `peticion` evita que una
  // respuesta vieja pise la de una recarga más reciente.
  const cancelado = useRef(false);
  const peticion = useRef(0);

  const cargar = useCallback(() => {
    cancelado.current = false;
    const id = ++peticion.current;
    setCargando(true);
    api<AlertaResponse[]>('/alertas')
      .then((datos) => {
        if (cancelado.current || peticion.current !== id) return;
        setAlertas(datos);
        setListo(true);
        setError(null);
        void sincronizarWidget(datos);
      })
      .catch((e: Error) => {
        if (cancelado.current || peticion.current !== id) return;
        setError(e.message);
      })
      .finally(() => {
        if (peticion.current !== id) return;
        setCargando(false);
      });
  }, []);

  useFocusEffect(
    useCallback(() => {
      cargar();
      return () => {
        cancelado.current = true;
        peticion.current++;
      };
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

  // La API entrega cada vuelta justo detrás de su ancla: ahí se detectan las
  // parejas; el resto de filas se pintan igual que hasta ahora.
  const filas = useMemo(() => agruparAlertas(alertas), [alertas]);

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
        data={filas}
        keyExtractor={(item) => (item.tipo === 'grupo' ? item.ida.id : item.alerta.id)}
        refreshControl={<RefreshControl refreshing={cargando} onRefresh={cargar} />}
        contentContainerStyle={s.lista}
        ListHeaderComponent={
          <View style={s.cabeceraLista}>
            <TarjetaProximoViaje alertas={listo ? alertas : null} />
            <TarjetaActividad />
          </View>
        }
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
        renderItem={({ item }) =>
          item.tipo === 'grupo' ? (
            <TarjetaIdaVuelta
              ida={item.ida}
              vuelta={item.vuelta}
              alternar={alternar}
              eliminar={eliminar}
            />
          ) : (
            <FilaAlerta item={item.alerta} alternar={alternar} eliminar={eliminar} />
          )
        }
      />
    </View>
  );
}

/**
 * Fila de la lista: una alerta suelta o la pareja ida/vuelta pintada como una
 * única tarjeta. `grupoId` (null en anclas y sueltas) permite detectarlas.
 */
type FilaAlertas =
  | { tipo: 'suelta'; alerta: AlertaResponse }
  | { tipo: 'grupo'; ida: AlertaResponse; vuelta: AlertaResponse };

/**
 * Detecta parejas en el orden que devuelve `GET /alertas`: una fila sin
 * `grupoId` cuya SIGUIENTE tenga `grupoId === id` se pinta junto a ella (la
 * vuelta deja de ser fila suelta). Anclas sin pareja y huérfanas quedan sueltas.
 */
function agruparAlertas(alertas: AlertaResponse[]): FilaAlertas[] {
  const filas: FilaAlertas[] = [];
  for (let i = 0; i < alertas.length; i++) {
    const ida = alertas[i];
    const vuelta = alertas[i + 1];
    if (ida && vuelta && !ida.grupoId && vuelta.grupoId === ida.id) {
      filas.push({ tipo: 'grupo', ida, vuelta });
      i++;
    } else if (ida) {
      filas.push({ tipo: 'suelta', alerta: ida });
    }
  }
  return filas;
}

/** Tono de la etiqueta de estado: la misma regla que en la fila suelta. */
const tonoEstado = (estado: string): 'exito' | 'aviso' | 'neutro' =>
  estado === 'ACTIVA' ? 'exito' : estado === 'PAUSA' ? 'aviso' : 'neutro';

/**
 * Fila de una alerta suelta: ruta, meta, avisos, estado y sus acciones.
 * Navega a `/alertas/[id]` al tocarla.
 */
/**
 * Meta de una alerta dentro de la lista: chips de criterio (plazas, precio…),
 * modalidad (conexiones / cualquier fecha / días), fecha legible, objetivo de
 * precio, franja horaria y tren. Es lo mismo que enseña la ficha de detalle,
 * para poder distinguir las alertas sin entrar en cada una.
 */
function MetaListaAlerta({ item }: { item: AlertaResponse }) {
  const { paleta } = useTema();
  const { t } = useTranslation();
  const s = useMemo(() => estilos(paleta), [paleta]);
  const criterios = criteriosDeAlerta(item);

  return (
    <>
      <View style={s.chipsAlerta}>
        {criterios.map((c) => (
          <Etiqueta key={c} tono="neutro">
            {etiquetaCriterio(c)}
          </Etiqueta>
        ))}
        {item.conexiones ? <Etiqueta tono="primario">{t('detalle.conexiones')}</Etiqueta> : null}
        {item.fechaFlexible ? (
          <Etiqueta tono="primario">{t('nueva.frecuencia.flexible')}</Etiqueta>
        ) : null}
        {item.recurrente ? (
          <Etiqueta tono="primario">{etiquetaDiasSemana(item.diasSemana)}</Etiqueta>
        ) : null}
      </View>
      <Text style={s.detalle}>
        {t('lista.metaAlerta', {
          fecha: item.fechaFlexible
            ? t('detalle.rangoFechas', {
                desde: fechaCorta(item.fechaDesde ?? item.fechaViaje),
                hasta: fechaCorta(item.fechaHasta ?? item.fechaViaje),
              })
            : fechaCorta(item.fechaViaje),
          min: item.intervaloSondeoMin,
          bono: item.bono,
        })}
      </Text>
      {criterios.includes('PRECIO') && item.precioObjetivo != null ? (
        <Text style={s.detalle}>
          {t('detalle.objetivo', { precio: formatearPrecio(item.precioObjetivo) })}
        </Text>
      ) : null}
      {item.horaDesde || item.horaHasta ? (
        <Text style={s.detalle}>
          {t('detalle.franja', {
            desde: item.horaDesde ?? '00:00',
            hasta: item.horaHasta ?? '23:59',
          })}
          {item.numeroTren ? t('detalle.trenSufijo', { tren: item.numeroTren }) : ''}
        </Text>
      ) : item.numeroTren ? (
        <Text style={s.detalle}>{t('detalle.tren', { tren: item.numeroTren })}</Text>
      ) : null}
    </>
  );
}

function FilaAlerta({
  item,
  alternar,
  eliminar,
}: {
  item: AlertaResponse;
  alternar: (alerta: AlertaResponse) => void;
  eliminar: (alerta: AlertaResponse) => void;
}) {
  const { paleta } = useTema();
  const { t } = useTranslation();
  const s = useMemo(() => estilos(paleta), [paleta]);

  return (
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
            <MetaListaAlerta item={item} />
            <View style={s.filaAvisos}>
              <Ionicons name="notifications-outline" size={13} color={paleta.textoSecundario} />
              <Text style={s.avisos}>{etiquetaAvisos(item.avisosRecibidos ?? 0)}</Text>
            </View>
          </View>
          <View style={s.filaDerecha}>
            <Etiqueta tono={tonoEstado(item.estado)}>{etiquetaEstado(item.estado)}</Etiqueta>
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
            onPress={() => router.push({ pathname: '/alertas/nueva', params: { editar: item.id } })}
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
  );
}

/**
 * Tarjeta agrupada «Ida y vuelta»: badge de cabecera y dos tramos, cada uno con
 * su etiqueta (Ida/Vuelta), su contenido y su estado; cada tramo navega al
 * detalle SUYO (`/alertas/[id]`). Pausa, edición y eliminación van al id del
 * ancla: la API propaga estado y borrado a la pareja (las ediciones son por
 * tramo, así que solo tocan la ida).
 */
function TarjetaIdaVuelta({
  ida,
  vuelta,
  alternar,
  eliminar,
}: {
  ida: AlertaResponse;
  vuelta: AlertaResponse;
  alternar: (alerta: AlertaResponse) => void;
  eliminar: (alerta: AlertaResponse) => void;
}) {
  const { paleta } = useTema();
  const { t } = useTranslation();
  const s = useMemo(() => estilos(paleta), [paleta]);

  return (
    <Tarjeta>
      <Etiqueta tono="primario">{t('alertas.idaVuelta')}</Etiqueta>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('lista.a11yVer', {
          origen: ida.origenNombre,
          destino: ida.destinoNombre,
        })}
        accessibilityHint={t('lista.a11yPista')}
        onPress={() => router.push(`/alertas/${ida.id}`)}
        style={({ pressed }) => ({ opacity: pressed ? 0.9 : 1 })}
      >
        <View style={s.filaAlerta}>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={s.grupoTramo}>{t('alertas.ida')}</Text>
            <Text style={s.ruta}>
              {ida.origenNombre} <Text style={{ color: paleta.primario }}>→</Text>{' '}
              {ida.destinoNombre}
            </Text>
            <MetaListaAlerta item={ida} />
          </View>
          <View style={s.filaDerecha}>
            <Etiqueta tono={tonoEstado(ida.estado)}>{etiquetaEstado(ida.estado)}</Etiqueta>
            <Ionicons name="chevron-forward" size={16} color={paleta.textoSecundario} />
          </View>
        </View>
      </Pressable>
      <View style={s.grupoSeparador} />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('lista.a11yVer', {
          origen: vuelta.origenNombre,
          destino: vuelta.destinoNombre,
        })}
        accessibilityHint={t('lista.a11yPista')}
        onPress={() => router.push(`/alertas/${vuelta.id}`)}
        style={({ pressed }) => ({ opacity: pressed ? 0.9 : 1 })}
      >
        <View style={s.filaAlerta}>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={s.grupoTramo}>{t('alertas.vuelta')}</Text>
            <Text style={s.ruta}>
              {vuelta.origenNombre} <Text style={{ color: paleta.primario }}>→</Text>{' '}
              {vuelta.destinoNombre}
            </Text>
            <MetaListaAlerta item={vuelta} />
          </View>
          <View style={s.filaDerecha}>
            <Etiqueta tono={tonoEstado(vuelta.estado)}>{etiquetaEstado(vuelta.estado)}</Etiqueta>
            <Ionicons name="chevron-forward" size={16} color={paleta.textoSecundario} />
          </View>
        </View>
      </Pressable>
      <View style={s.acciones}>
        <Boton
          titulo={ida.estado === 'ACTIVA' ? t('lista.pausar') : t('lista.reanudar')}
          variante="contorno"
          onPress={() => void alternar(ida)}
          style={s.botonAccion}
        />
        <Boton
          titulo={t('comunes.editar')}
          variante="contorno"
          onPress={() => router.push({ pathname: '/alertas/nueva', params: { editar: ida.id } })}
          style={s.botonAccion}
        />
        <Boton
          titulo={t('comunes.eliminar')}
          variante="fantasma"
          onPress={() => eliminar(ida)}
          style={s.botonAccion}
        />
      </View>
    </Tarjeta>
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

/**
 * "Tu actividad": avisos de los últimos 30 días con su desglose por tipo y el
 * estado de las alertas, en una tarjeta compacta bajo «Tu próximo viaje».
 * Sin datos (carga en curso o error de `GET /estadisticas`) no pinta nada.
 */
function TarjetaActividad() {
  const [datos, setDatos] = useState<EstadisticasResponse | null>(null);
  const { paleta } = useTema();
  const { t } = useTranslation();
  const s = useMemo(() => estilos(paleta), [paleta]);

  useEffect(() => {
    let cancelado = false;
    api<EstadisticasResponse>('/estadisticas')
      .then((respuesta) => {
        if (!cancelado) setDatos(respuesta);
      })
      .catch(() => undefined);
    return () => {
      cancelado = true;
    };
  }, []);

  if (datos === null) return null;

  // Etiquetas ya traducidas: el tipo que llega de la API solo indexa, no es
  // una clave dinámica de i18n.
  const etiquetas: Record<string, string> = {
    [TIPO_AVISO_SIN_TIPO]: t('actividad.tipoAlertas'),
    cancelacion: t('actividad.tipoCancelacion'),
    parada_suprimida: t('actividad.tipoParadaSuprimida'),
    incidencia: t('actividad.tipoIncidencia'),
    'recordatorio-salida': t('actividad.tipoRecordatorio'),
    'resumen-viaje': t('actividad.tipoResumenViaje'),
    precio: t('actividad.tipoPrecio'),
    'digest-email': t('actividad.tipoDigest'),
    'resumen-semanal': t('actividad.tipoSemanal'),
  };

  const avisos = datos.avisos.total;
  const activas = datos.alertas.activas;
  const textoAvisos = avisos === 1 ? t('actividad.aviso1') : t('actividad.avisosN', { n: avisos });
  const textoActivas =
    activas === 1 ? t('actividad.activa1') : t('actividad.activasN', { n: activas });

  const tipos = Object.entries(datos.avisos.porTipo).sort(([, a], [, b]) => b - a);
  const lineas: string[] = [];
  let otros = 0;
  for (const [tipo, total] of tipos) {
    const etiqueta = etiquetas[tipo];
    if (etiqueta) lineas.push(`${etiqueta} ${total}`);
    else otros += total;
  }
  if (otros > 0) lineas.push(`${t('actividad.tipoOtro')} ${otros}`);

  const resumen = [t('actividad.dias', { n: datos.periodoDias }), textoAvisos, textoActivas].join(
    ' · ',
  );

  return (
    <Tarjeta>
      <View style={s.actividadFila}>
        <Ionicons name="stats-chart-outline" size={14} color={paleta.primario} />
        <Text style={s.actividadTitulo}>{t('actividad.titulo')}</Text>
      </View>
      <Text style={s.actividadResumen}>{resumen}</Text>
      {lineas.length > 0 ? (
        <View style={s.actividadDesglose}>
          <Text style={s.actividadDesgloseTitulo}>{t('actividad.desglose')}</Text>
          <Text style={s.actividadDesgloseLinea}>{lineas.join(' · ')}</Text>
        </View>
      ) : null}
    </Tarjeta>
  );
}

const estilos = (c: Paleta) =>
  StyleSheet.create({
    cabeceraLista: {
      gap: espaciado.sm,
    },
    pantalla: fondoPantalla(c),
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
    titulo: tituloPantalla(c),
    botonNueva: {
      minHeight: 40,
      paddingVertical: 8,
      paddingHorizontal: 14,
    },
    lista: contenidoLista(),
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
    ruta: nombre(c),
    detalle: meta(c),
    chipsAlerta: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 4,
    },
    filaAvisos: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    avisos: pista(c),
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
    grupoSeparador: {
      height: 1,
      backgroundColor: c.borde,
    },
    grupoTramo: {
      fontSize: 12,
      fontWeight: '700',
      color: c.textoSecundario,
    },
    vacio: vacioContenedor(c),
    vacioTitulo: vacioTitulo(c),
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
    actividadFila: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    actividadTitulo: {
      flex: 1,
      fontSize: 13,
      fontWeight: '700',
      color: c.primario,
    },
    actividadResumen: {
      fontSize: 14,
      fontWeight: '600',
      color: c.texto,
    },
    actividadDesglose: {
      gap: 2,
    },
    actividadDesgloseTitulo: {
      fontSize: 11,
      fontWeight: '700',
      color: c.textoSecundario,
    },
    actividadDesgloseLinea: {
      fontSize: 12,
      color: c.textoSecundario,
    },
  });
