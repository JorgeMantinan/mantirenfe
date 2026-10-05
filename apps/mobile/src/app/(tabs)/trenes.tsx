import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import {
  Dimensions,
  FlatList,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import {
  esOuigo,
  funcionIndemnizacion,
  horaGtfs,
  type EstacionDetalleResponse,
  type EstacionResponse,
  type HorarioTrenResponse,
  type HorariosResponse,
  type MotivoHorarios,
  type PosicionTrenResponse,
  type PuntualidadTrenResponse,
} from '@mantirenfe/shared-types';
import { Boton } from '@/components/Boton';
import { Etiqueta, Tarjeta } from '@/components/Tarjeta';
import { useSugerenciasEstacion } from '@/hooks/useSugerenciasEstacion';
import { locale } from '@/i18n';
import { api } from '@/lib/api';
import { useTema } from '@/lib/tema-contexto';
import { espaciado, radio, type Paleta } from '@/lib/tema';

type Modo = 'estaciones' | 'horarios' | 'posiciones' | 'impuntuales';
type OrdenImpuntuales = 'veces' | 'impuntualidad';
type FranjaSalida = 'todo' | 'manana' | 'tarde' | 'noche';

/**
 * Chips de franja de salida para el modo horarios: [desde, hasta) para que
 * las horas de frontera (12:00, 20:00) no cuenten dos veces. «Noche» llega
 * hasta 24:00, que en HH:MM incluye las 23:59.
 */
const FRANJAS_SALIDA: Array<{
  id: FranjaSalida;
  desde: string | null;
  hasta: string | null;
}> = [
  { id: 'todo', desde: null, hasta: null },
  { id: 'manana', desde: '06:00', hasta: '12:00' },
  { id: 'tarde', desde: '12:00', hasta: '20:00' },
  { id: 'noche', desde: '20:00', hasta: '24:00' },
];

/** Tope del bloque «Salidas de X hoy»: así la lista de estaciones de debajo sigue viéndose. */
const MAX_ALTO_SALIDAS = Dimensions.get('window').height * 0.4;

/** Filas por página del listado de estaciones (scroll infinito con offset). */
const PAGINA_ESTACIONES = 20;

/** Origen permitido dentro del WebView del mapa (cualquier otro, fuera). */
const ORIGEN_MAPA = 'https://mantirenfe.vercel.app';

/** ¿Es una URL del propio mapa? (no basta con `startsWith`: evitaría spoofing) */
function esDelMapa(destino: string): boolean {
  if (destino === 'about:blank') return true;
  try {
    const parsed = new URL(destino);
    return parsed.protocol === 'https:' && parsed.host === 'mantirenfe.vercel.app';
  } catch {
    return false;
  }
}

function mesActual(): string {
  return new Date().toISOString().slice(0, 7);
}

/** Mes siguiente/anterior en formato YYYY-MM (sin pasar del mes en curso). */
function cambiarMes(mes: string, delta: number): string {
  const [anio, mesNum] = mes.split('-').map(Number);
  const siguiente = new Date(Date.UTC(anio, mesNum - 1 + delta, 1));
  const nuevo = siguiente.toISOString().slice(0, 7);
  return nuevo > mesActual() ? mesActual() : nuevo;
}

function nombreMes(mes: string): string {
  return new Date(`${mes}-02T00:00:00Z`).toLocaleDateString(locale(), {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function formatMinutos(segundos: number): string {
  if (segundos < 60) return `${Math.round(segundos)} s`;
  return `${Math.round(segundos / 60)} min`;
}

/** Minúsculas sin tildes, para que "A Coruña" matchee con "La Coruña" o "coruña" */
function normalizarTexto(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function quitarArticulo(texto: string): string {
  return texto.replace(/^(la|el|los|las|a|o)\s+/, '');
}

/** Enlace externo a OpenStreetMap con la estación centrada (zoom 16). */
function mapaExterno(latitud: number, longitud: number): string {
  return `https://www.openstreetmap.org/?mlat=${latitud}&mlon=${longitud}#map=16/${latitud}/${longitud}`;
}

export default function Trenes() {
  const [modo, setModo] = useState<Modo>('estaciones');
  const [estaciones, setEstaciones] = useState<EstacionResponse[]>([]);
  const [buscar, setBuscar] = useState('');
  const [cargando, setCargando] = useState(false);

  const [origen, setOrigen] = useState('');
  const [destino, setDestino] = useState('');
  const [fecha, setFecha] = useState(() => new Date().toISOString().slice(0, 10));
  const [horarios, setHorarios] = useState<HorarioTrenResponse[] | null>(null);
  const [errorHorarios, setErrorHorarios] = useState<string | null>(null);
  // Motivo de una respuesta vacía: estación inexistente vs. sin trenes
  const [motivoHorarios, setMotivoHorarios] = useState<MotivoHorarios | null>(null);
  const [sinEstacion, setSinEstacion] = useState<string[]>([]);
  // Franja de salida: filtra solo lo ya cargado (sin tocar la API) y se
  // mantiene al repetir la búsqueda.
  const [franjaSalida, setFranjaSalida] = useState<FranjaSalida>('todo');

  const [posiciones, setPosiciones] = useState<PosicionTrenResponse[]>([]);
  const [errorPosiciones, setErrorPosiciones] = useState<string | null>(null);
  const [filtroPos, setFiltroPos] = useState('');
  const [vistaPos, setVistaPos] = useState<'lista' | 'mapa'>('lista');

  const [mes, setMes] = useState(mesActual);
  const [orden, setOrden] = useState<OrdenImpuntuales>('veces');
  const [impuntuales, setImpuntuales] = useState<PuntualidadTrenResponse[] | null>(null);
  const [errorImpuntuales, setErrorImpuntuales] = useState<string | null>(null);

  const { paleta, oscuro } = useTema();
  const { t } = useTranslation();
  const s = useMemo(() => estilos(paleta), [paleta]);

  const etiquetasModo: Record<Modo, string> = {
    estaciones: t('trenes.modo.estaciones'),
    horarios: t('trenes.modo.horarios'),
    posiciones: t('trenes.modo.posiciones'),
    impuntuales: t('trenes.modo.impuntuales'),
  };
  const etiquetasFranja: Record<FranjaSalida, string> = {
    todo: t('trenes.franja.todo'),
    manana: t('trenes.franja.manana'),
    tarde: t('trenes.franja.tarde'),
    noche: t('trenes.franja.noche'),
  };
  const etiquetasOrden: Record<OrdenImpuntuales, string> = {
    veces: t('trenes.orden.veces'),
    impuntualidad: t('trenes.orden.retraso'),
  };
  const vistas: Array<['lista' | 'mapa', 'list' | 'map', string]> = [
    ['lista', 'list', t('trenes.vistaLista')],
    ['mapa', 'map', t('trenes.vistaMapa')],
  ];

  const posicionesVisibles = useMemo(() => {
    const q = normalizarTexto(filtroPos);
    if (!q) return posiciones;
    const palabras = q
      .split(/\s+/)
      .filter((w) => !['la', 'el', 'los', 'las', 'a', 'o'].includes(w));
    if (palabras.length === 0) return posiciones;
    return posiciones.filter((p) => {
      const campos = [p.numeroTren, p.origenNombre, p.destinoNombre, p.id, p.operador]
        .filter(Boolean)
        .map((c) => quitarArticulo(normalizarTexto(String(c))));
      return palabras.every((palabra) => campos.some((c) => c.includes(palabra)));
    });
  }, [posiciones, filtroPos]);

  // `horaGtfs` devuelve «HH:MM», así que comparar strings es comparar horas.
  const horariosVisibles = useMemo(() => {
    const lista = horarios ?? [];
    const franja = FRANJAS_SALIDA.find((f) => f.id === franjaSalida);
    if (!franja) return lista;
    const { desde, hasta } = franja;
    if (!desde || !hasta) return lista;
    return lista.filter((t) => {
      const salida = horaGtfs(t.salida);
      return /^\d{2}:\d{2}$/.test(salida) && salida >= desde && salida < hasta;
    });
  }, [horarios, franjaSalida]);

  // Listado de estaciones paginado: `reset` vuelve al principio (foco, refresh
  // o búsqueda nueva) y sin `reset` añade la página siguiente (+20).
  const [cargandoMasEstaciones, setCargandoMasEstaciones] = useState(false);
  const [hayMasEstaciones, setHayMasEstaciones] = useState(true);
  const offsetEstaciones = useRef(0);
  const consultaEstaciones = useRef('');
  const cargandoPaginaEstaciones = useRef(false);
  const recargaEstacionesVuelo = useRef(false);
  const peticionEstaciones = useRef(0);

  const cargarEstaciones = useCallback((q?: string, reset = true) => {
    const texto = q?.trim();
    if (reset) {
      setHayMasEstaciones(true);
      setCargando(true);
      recargaEstacionesVuelo.current = true;
    } else {
      // onEndReached puede dispararse antes de repintar: una sola página en
      // vuelo y nunca por delante de una recarga que siga en curso (si no, su
      // respuesta, que ya no interesa, tiraría la de la recarga).
      if (cargandoPaginaEstaciones.current || recargaEstacionesVuelo.current) return;
      cargandoPaginaEstaciones.current = true;
      setCargandoMasEstaciones(true);
    }
    const id = ++peticionEstaciones.current;
    const desde = reset ? 0 : offsetEstaciones.current;
    consultaEstaciones.current = texto ?? '';
    const query = texto ? `&q=${encodeURIComponent(texto)}` : '';
    api<EstacionResponse[]>(`/estaciones?limite=${PAGINA_ESTACIONES}&offset=${desde}${query}`)
      .then((r) => {
        if (peticionEstaciones.current !== id) return;
        offsetEstaciones.current = desde + r.length;
        setHayMasEstaciones(r.length >= PAGINA_ESTACIONES);
        setEstaciones((prev) => (reset ? r : [...prev, ...r]));
      })
      .catch(() => {
        if (peticionEstaciones.current !== id) return;
        if (reset) setEstaciones([]);
        setHayMasEstaciones(false);
      })
      .finally(() => {
        if (!reset) cargandoPaginaEstaciones.current = false;
        if (peticionEstaciones.current !== id) return;
        if (reset) recargaEstacionesVuelo.current = false;
        setCargando(false);
        setCargandoMasEstaciones(false);
      });
  }, []);

  /** Siguiente página: pagina sobre la consulta con la que se cargó la lista. */
  const cargarMasEstaciones = () => {
    if (cargando || cargandoMasEstaciones || !hayMasEstaciones) return;
    cargarEstaciones(consultaEstaciones.current || undefined, false);
  };

  const [salidas, setSalidas] = useState<HorarioTrenResponse[] | null>(null);
  // Distingue «no hay salidas» de «la petición ha fallado» (la lista vacía
  // se pintaría como «sin salidas» y es mentira)
  const [errorSalidas, setErrorSalidas] = useState<string | null>(null);
  const [cargandoSalidas, setCargandoSalidas] = useState(false);
  const [estacionSel, setEstacionSel] = useState('');
  // Ficha enriquecida (data.renfe.com): se pide en paralelo a las salidas y si
  // falla seguimos enseñando la tarjeta solo con las salidas.
  const [detalle, setDetalle] = useState<EstacionDetalleResponse | null>(null);
  const [detalleListo, setDetalleListo] = useState(false);
  const [coordsSel, setCoordsSel] = useState<{ lat: number; lng: number } | null>(null);
  const peticionDetalle = useRef(0);
  // Invalida las salidas de una estación anterior (o de antes de desmontar)
  const peticionSalidas = useRef(0);
  // Ídem para las posiciones en tiempo real
  const peticionPosiciones = useRef(0);

  const cargarDetalle = useCallback((nombre: string) => {
    const id = ++peticionDetalle.current;
    setDetalle(null);
    setDetalleListo(false);
    api<EstacionDetalleResponse>(`/estaciones/detalle?q=${encodeURIComponent(nombre)}`)
      .then((d) => {
        if (peticionDetalle.current !== id) return;
        setDetalle(d);
        setDetalleListo(true);
      })
      .catch(() => {
        if (peticionDetalle.current !== id) return;
        setDetalle(null);
        setDetalleListo(true);
      });
  }, []);

  const cargarSalidas = useCallback(
    (nombre: string, estacion?: EstacionResponse) => {
      const fechaHoy = new Date().toISOString().slice(0, 10);
      const id = ++peticionSalidas.current;
      setEstacionSel(nombre);
      setSalidas(null);
      setErrorSalidas(null);
      setCargandoSalidas(true);
      setCoordsSel(
        estacion && estacion.latitud !== null && estacion.longitud !== null
          ? { lat: estacion.latitud, lng: estacion.longitud }
          : null,
      );
      cargarDetalle(nombre);
      api<HorarioTrenResponse[]>(
        `/trenes/estacion?estacion=${encodeURIComponent(nombre)}&fecha=${fechaHoy}`,
      )
        .then((r) => {
          if (peticionSalidas.current !== id) return;
          setSalidas(r);
        })
        .catch((e: Error) => {
          if (peticionSalidas.current !== id) return;
          setErrorSalidas(e.message || t('trenes.errorSalidas'));
          setSalidas([]);
        })
        .finally(() => {
          if (peticionSalidas.current !== id) return;
          setCargandoSalidas(false);
        });
    },
    [cargarDetalle, t],
  );

  /** Cierra la tarjeta de salidas y cancela la ficha pendiente (si la hay). */
  const cerrarSalidas = () => {
    peticionSalidas.current++;
    peticionDetalle.current++;
    setSalidas(null);
    setErrorSalidas(null);
    setEstacionSel('');
    setDetalle(null);
    setDetalleListo(false);
    setCoordsSel(null);
  };

  // Al desmontar, ninguna petición pendiente debe tocar el estado
  useEffect(
    () => () => {
      peticionSalidas.current++;
      peticionDetalle.current++;
      peticionPosiciones.current++;
      peticionEstaciones.current++;
      peticionImpuntuales.current++;
    },
    [],
  );

  // Búsqueda en el servidor mientras se escribe (la lista paginada no incluía,
  // p.ej., estaciones como Arcade que empiezan pasadas las primeras páginas).
  // Usa el mismo `cargarEstaciones`, así que una búsqueda larga también pagina.
  const timerBusqueda = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const buscarEstacionesTexto = (texto: string) => {
    clearTimeout(timerBusqueda.current);
    const q = texto.trim();
    if (q.length < 2) {
      cargarEstaciones();
      return;
    }
    timerBusqueda.current = setTimeout(() => cargarEstaciones(q), 250);
  };

  useEffect(() => () => clearTimeout(timerBusqueda.current), []);

  // Sugerencias para el formulario de horarios (hook compartido con alertas)
  const { sugOrigen, sugDestino, buscarSugerencias, limpiarSugerencias } = useSugerenciasEstacion();

  const cargarPosiciones = useCallback(() => {
    const id = ++peticionPosiciones.current;
    setCargando(true);
    api<{ trenes: PosicionTrenResponse[] }>('/trenes/posiciones')
      .then((d) => {
        if (peticionPosiciones.current !== id) return;
        setPosiciones(d.trenes);
        setErrorPosiciones(null);
      })
      .catch((e: Error) => {
        if (peticionPosiciones.current !== id) return;
        setErrorPosiciones(e.message);
      })
      .finally(() => {
        if (peticionPosiciones.current !== id) return;
        setCargando(false);
      });
  }, []);

  // Depende de mes/orden: useFocusEffect se vuelve a ejecutar al cambiarlos (y al
  // recuperar el foco), así que no hace falta un useEffect aparte que duplique la llamada.
  const peticionImpuntuales = useRef(0);
  const cargarImpuntuales = useCallback(() => {
    const peticion = ++peticionImpuntuales.current;
    setImpuntuales(null);
    setErrorImpuntuales(null);
    setCargando(true);
    api<PuntualidadTrenResponse[]>(`/trenes/puntualidad?mes=${mes}&orden=${orden}`)
      .then((d) => {
        if (peticion !== peticionImpuntuales.current) return;
        setImpuntuales(d);
        setErrorImpuntuales(null);
      })
      .catch((e: Error) => {
        if (peticion !== peticionImpuntuales.current) return;
        setErrorImpuntuales(e.message);
        setImpuntuales([]);
      })
      .finally(() => {
        if (peticion === peticionImpuntuales.current) setCargando(false);
      });
  }, [mes, orden]);

  useFocusEffect(
    useCallback(() => {
      if (modo === 'estaciones') cargarEstaciones();
      if (modo === 'posiciones') cargarPosiciones();
      if (modo === 'impuntuales') cargarImpuntuales();
    }, [modo, cargarEstaciones, cargarPosiciones, cargarImpuntuales]),
  );

  const buscarHorarios = async () => {
    if (!origen.trim() || !destino.trim() || !fecha) return;
    limpiarSugerencias();
    setCargando(true);
    setErrorHorarios(null);
    try {
      const datos = await api<HorariosResponse>(
        `/trenes/horarios?origen=${encodeURIComponent(origen.trim())}&destino=${encodeURIComponent(destino.trim())}&fecha=${fecha}`,
      );
      setHorarios(datos.trenes);
      setMotivoHorarios(datos.motivo ?? null);
      setSinEstacion(datos.estacionesNoEncontradas ?? []);
    } catch (e) {
      setErrorHorarios(e instanceof Error ? e.message : t('trenes.errorBusqueda'));
      setHorarios(null);
    } finally {
      setCargando(false);
    }
  };

  const refrescar = () => {
    // Pull-to-refresh: recarga con `reset`, así que vuelve al offset 0
    if (modo === 'estaciones') cargarEstaciones(buscar.trim() || undefined);
    if (modo === 'posiciones') cargarPosiciones();
    if (modo === 'horarios') void buscarHorarios();
    if (modo === 'impuntuales') cargarImpuntuales();
  };

  // Referencia estable para la fila de horarios (React.memo de la fila)
  const crearAlertaHorario = useCallback(
    (numeroTren: string) => {
      router.push({
        pathname: '/alertas/nueva',
        params: { origen, destino, fecha, numeroTren },
      });
    },
    [origen, destino, fecha],
  );

  // Ficha de la estación seleccionada (fallo tolerado: sin ficha no se rompe nada)
  const latitud = detalle?.latitud ?? coordsSel?.lat ?? null;
  const longitud = detalle?.longitud ?? coordsSel?.lng ?? null;
  const urlMapa = latitud !== null && longitud !== null ? mapaExterno(latitud, longitud) : null;
  const aforos = (detalle?.aforos ?? []).slice(0, 3);
  const lineaFicha = [
    detalle?.poblacion,
    detalle?.provincia,
    detalle?.cp ? `CP ${detalle.cp}` : null,
  ]
    .filter((valor): valor is string => Boolean(valor))
    .join(' · ');

  return (
    <View style={s.pantalla}>
      <View style={s.encabezado}>
        <Text style={s.titulo}>{t('pestanas.trenes')}</Text>
        <View style={s.modos}>
          {(['estaciones', 'horarios', 'posiciones', 'impuntuales'] as Array<Modo>).map((valor) => (
            <Text
              key={valor}
              style={[s.modo, modo === valor && s.modoActivo]}
              onPress={() => setModo(valor)}
            >
              {etiquetasModo[valor]}
            </Text>
          ))}
        </View>

        {modo === 'impuntuales' && (
          <>
            <View style={s.mesFila}>
              <Text
                style={s.mesFlecha}
                onPress={() => setMes((m) => cambiarMes(m, -1))}
                suppressHighlighting
              >
                ‹
              </Text>
              <Text style={s.mesNombre}>{nombreMes(mes)}</Text>
              <Text
                style={[s.mesFlecha, mes >= mesActual() && s.mesFlechaInactiva]}
                onPress={() => setMes((m) => (m >= mesActual() ? m : cambiarMes(m, 1)))}
                suppressHighlighting
              >
                ›
              </Text>
            </View>
            <View style={s.modos}>
              {(['veces', 'impuntualidad'] as Array<OrdenImpuntuales>).map((valor) => (
                <Text
                  key={valor}
                  style={[s.modo, orden === valor && s.modoActivo]}
                  onPress={() => setOrden(valor)}
                >
                  {etiquetasOrden[valor]}
                </Text>
              ))}
            </View>
          </>
        )}

        {modo === 'estaciones' && (
          <TextInput
            style={s.campo}
            placeholder={t('trenes.placeholderBuscar')}
            placeholderTextColor={paleta.textoSecundario}
            value={buscar}
            onChangeText={(v) => {
              setBuscar(v);
              buscarEstacionesTexto(v);
            }}
          />
        )}

        {modo === 'posiciones' && vistaPos === 'lista' && (
          <TextInput
            style={s.campo}
            placeholder={t('trenes.placeholderFiltrar')}
            placeholderTextColor={paleta.textoSecundario}
            value={filtroPos}
            onChangeText={setFiltroPos}
          />
        )}

        {modo === 'posiciones' && (
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
            {vistas.map(([valor, icono, etiqueta]) => (
              <Pressable
                key={valor}
                onPress={() => setVistaPos(valor)}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 4,
                  paddingVertical: 6,
                  paddingHorizontal: 12,
                  borderRadius: 999,
                  backgroundColor: vistaPos === valor ? paleta.primario : paleta.fondoSecundario,
                }}
              >
                <Ionicons
                  name={icono}
                  size={16}
                  color={vistaPos === valor ? '#ffffff' : paleta.textoSecundario}
                />
                <Text
                  style={{
                    color: vistaPos === valor ? '#ffffff' : paleta.textoSecundario,
                    fontWeight: '600',
                    fontSize: 13,
                  }}
                >
                  {etiqueta}
                </Text>
              </Pressable>
            ))}
          </View>
        )}

        {modo === 'horarios' && (
          <View style={s.formulario}>
            <TextInput
              style={s.campo}
              placeholder={t('trenes.placeholderOrigen')}
              placeholderTextColor={paleta.textoSecundario}
              value={origen}
              onChangeText={(v) => {
                setOrigen(v);
                buscarSugerencias('origen', v);
              }}
            />
            {sugOrigen.map((e) => (
              <Text
                key={e.id}
                style={s.sugerencia}
                onPress={() => {
                  setOrigen(e.nombre);
                  limpiarSugerencias();
                }}
              >
                {e.nombre}
              </Text>
            ))}
            <TextInput
              style={s.campo}
              placeholder={t('trenes.placeholderDestino')}
              placeholderTextColor={paleta.textoSecundario}
              value={destino}
              onChangeText={(v) => {
                setDestino(v);
                buscarSugerencias('destino', v);
              }}
            />
            {sugDestino.map((e) => (
              <Text
                key={e.id}
                style={s.sugerencia}
                onPress={() => {
                  setDestino(e.nombre);
                  limpiarSugerencias();
                }}
              >
                {e.nombre}
              </Text>
            ))}
            <TextInput
              style={s.campo}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={paleta.textoSecundario}
              keyboardType="numbers-and-punctuation"
              value={fecha}
              onChangeText={setFecha}
            />
            <Boton
              titulo={cargando ? t('trenes.buscando') : t('trenes.buscarHorarios')}
              onPress={() => void buscarHorarios()}
              cargando={cargando}
            />
          </View>
        )}
      </View>

      {modo === 'estaciones' && (cargandoSalidas || salidas !== null) && (
        <Tarjeta style={{ borderColor: paleta.primario, marginHorizontal: espaciado.md }}>
          <View style={s.fila}>
            <Text style={s.nombre}>
              {cargandoSalidas
                ? t('trenes.cargandoSalidas')
                : t('trenes.salidasDe', { estacion: estacionSel })}
            </Text>
            <Text style={{ color: paleta.primario, fontWeight: '600' }} onPress={cerrarSalidas}>
              {t('comunes.cerrar')}
            </Text>
          </View>
          {!cargandoSalidas && !detalleListo ? (
            <Text style={s.meta}>{t('trenes.cargandoEstacion')}</Text>
          ) : detalle ? (
            <View style={s.ficha}>
              {detalle.direccion ? <Text style={s.meta}>{detalle.direccion}</Text> : null}
              {lineaFicha ? <Text style={s.meta}>{lineaFicha}</Text> : null}
              {urlMapa ? (
                <Boton
                  titulo={t('trenes.verMapa')}
                  variante="contorno"
                  onPress={() => {
                    void Linking.openURL(urlMapa).catch(() => undefined);
                  }}
                  style={s.botonMapa}
                />
              ) : null}
              {aforos.length > 0 ? (
                <View style={s.aforos}>
                  <Text style={s.nombre}>{t('trenes.aforo')}</Text>
                  {aforos.map((aforo) => (
                    <Text key={aforo.franja} style={s.meta}>
                      {aforo.franja} ·{' '}
                      {t('trenes.viajeros', {
                        n: (aforo.subidos + aforo.bajados).toLocaleString(locale()),
                      })}
                    </Text>
                  ))}
                </View>
              ) : null}
            </View>
          ) : null}
          {/* Un fallo no es «sin salidas»: se distingue el catch del vacío */}
          {errorSalidas ? (
            <Text style={{ color: paleta.error, fontSize: 13 }}>{errorSalidas}</Text>
          ) : !cargandoSalidas && (salidas ?? []).length === 0 ? (
            <Text style={s.meta}>{t('trenes.sinSalidas')}</Text>
          ) : (
            <ScrollView style={s.salidasScroll} nestedScrollEnabled>
              {(salidas ?? []).map((salida, i) => (
                <View key={`${salida.numeroTren}-${salida.salida}-${i}`} style={{ marginTop: 6 }}>
                  <Text style={s.nombre}>
                    {horaGtfs(salida.salida)} · {salida.numeroTren}
                  </Text>
                  <Text style={s.meta}>
                    {salida.origenNombre} → {salida.destinoNombre}
                    {salida.operador ? ` · ${salida.operador}` : ''}
                  </Text>
                  {estacionSel && salida.destinoNombre !== estacionSel ? (
                    <Pressable
                      onPress={() =>
                        router.push(
                          `/alertas/nueva?origen=${encodeURIComponent(estacionSel)}` +
                            `&destino=${encodeURIComponent(salida.destinoNombre)}` +
                            `&fecha=${new Date().toISOString().slice(0, 10)}` +
                            `&numeroTren=${encodeURIComponent(salida.numeroTren)}`,
                        )
                      }
                      style={{ marginTop: 2, alignSelf: 'flex-start' }}
                    >
                      <Text style={{ color: paleta.primario, fontSize: 13, fontWeight: '600' }}>
                        {t('trenes.crearAlertaFila')}
                      </Text>
                    </Pressable>
                  ) : null}
                </View>
              ))}
            </ScrollView>
          )}
        </Tarjeta>
      )}

      {modo === 'estaciones' && (
        <FlatList
          data={estaciones}
          keyExtractor={(item) => item.id}
          refreshControl={<RefreshControl refreshing={cargando} onRefresh={() => refrescar()} />}
          contentContainerStyle={s.lista}
          onEndReachedThreshold={0.4}
          onEndReached={cargarMasEstaciones}
          initialNumToRender={10}
          ListFooterComponent={
            cargandoMasEstaciones ? <Text style={s.pieLista}>{t('trenes.cargandoMas')}</Text> : null
          }
          renderItem={({ item }) => (
            <FilaEstacion
              estacion={item}
              activa={estacionSel === item.nombre}
              onPulsar={cargarSalidas}
            />
          )}
          ListEmptyComponent={
            <Text style={s.vacio}>
              {cargando ? t('trenes.buscando') : t('trenes.noEstaciones')}
            </Text>
          }
        />
      )}

      {modo === 'horarios' && (
        <FlatList
          data={horariosVisibles}
          keyExtractor={(item, index) => `${item.numeroTren}-${item.salida}-${index}`}
          refreshControl={<RefreshControl refreshing={cargando} onRefresh={() => refrescar()} />}
          contentContainerStyle={s.lista}
          ListHeaderComponent={
            errorHorarios ? (
              <Tarjeta style={{ borderColor: paleta.error }}>
                <Text style={{ color: paleta.error }}>{errorHorarios}</Text>
              </Tarjeta>
            ) : horarios && horarios.length === 0 ? (
              <Tarjeta>
                <Text style={s.nombre}>
                  {motivoHorarios === 'estaciones'
                    ? t('trenes.estacionNoEncontrada')
                    : t('trenes.sinTrenesRuta')}
                </Text>
                <Text style={[s.meta, { marginTop: 4 }]}>
                  {motivoHorarios === 'estaciones'
                    ? t('trenes.noEncontramos', {
                        lista:
                          sinEstacion.length > 0
                            ? sinEstacion.map((n) => `«${n}»`).join(t('comunes.y'))
                            : t('trenes.indicada'),
                      })
                    : t('trenes.sinDirectos', { origen, destino, fecha })}
                </Text>
                {motivoHorarios === 'estaciones' ? null : (
                  <Boton
                    titulo={t('trenes.crearAlerta')}
                    onPress={() =>
                      router.push({
                        pathname: '/alertas/nueva',
                        params: { origen, destino, fecha },
                      })
                    }
                    style={{ marginTop: 10, alignSelf: 'flex-start' }}
                  />
                )}
              </Tarjeta>
            ) : horarios && horarios.length > 0 ? (
              <View style={{ gap: espaciado.sm, marginBottom: espaciado.sm }}>
                <View style={s.modos}>
                  {FRANJAS_SALIDA.map((f) => (
                    <Text
                      key={f.id}
                      style={[s.modo, franjaSalida === f.id && s.modoActivo]}
                      onPress={() => setFranjaSalida(f.id)}
                      suppressHighlighting
                    >
                      {etiquetasFranja[f.id]}
                    </Text>
                  ))}
                </View>
                <Text style={s.meta}>
                  {t('trenes.mostrando', {
                    visibles: horariosVisibles.length,
                    total: horarios.length,
                  })}
                </Text>
                {horariosVisibles.length === 0 ? (
                  <Tarjeta>
                    <Text style={s.nombre}>{t('trenes.sinSalidasFranja')}</Text>
                    <Text style={[s.meta, { marginTop: 4 }]}>
                      {t('trenes.pruebaFranja', { todo: etiquetasFranja.todo })}
                    </Text>
                  </Tarjeta>
                ) : null}
              </View>
            ) : null
          }
          initialNumToRender={8}
          renderItem={({ item }) => (
            <FilaHorario
              horario={item}
              origen={origen}
              destino={destino}
              fecha={fecha}
              onCrearAlerta={crearAlertaHorario}
            />
          )}
        />
      )}

      {modo === 'posiciones' && vistaPos === 'mapa' && (
        <View style={{ flex: 1 }}>
          {errorPosiciones ? (
            <Text style={[s.vacio, { color: paleta.error }]}>{errorPosiciones}</Text>
          ) : null}
          <WebView
            // `app=1` = sin cabecera/menú de la web; `tema` = modo de la app
            source={{ uri: `${ORIGEN_MAPA}/mapa?app=1&tema=${oscuro ? 'oscuro' : 'claro'}` }}
            style={{ flex: 1 }}
            startInLoadingState
            userAgent="MantiRenfeApp/1.0"
            // Solo el mapa de la app: cualquier otro destino se abre fuera
            originWhitelist={[`${ORIGEN_MAPA}/*`]}
            onShouldStartLoadWithRequest={(solicitud) => {
              if (esDelMapa(solicitud.url)) return true;
              void Linking.openURL(solicitud.url).catch(() => undefined);
              return false;
            }}
          />
        </View>
      )}

      {modo === 'posiciones' && vistaPos === 'lista' && (
        <FlatList
          data={posicionesVisibles}
          keyExtractor={(item) => item.id}
          refreshControl={<RefreshControl refreshing={cargando} onRefresh={() => refrescar()} />}
          contentContainerStyle={s.lista}
          ListHeaderComponent={
            errorPosiciones ? (
              <Tarjeta style={{ borderColor: paleta.error }}>
                <Text style={{ color: paleta.error }}>{errorPosiciones}</Text>
              </Tarjeta>
            ) : posiciones.length === 0 ? (
              <Text style={s.vacio}>{t('trenes.sinPosiciones')}</Text>
            ) : posicionesVisibles.length === 0 ? (
              <Text style={s.vacio}>{t('trenes.sinCoincidencias', { filtro: filtroPos })}</Text>
            ) : null
          }
          initialNumToRender={10}
          renderItem={({ item }) => <FilaPosicion posicion={item} />}
        />
      )}

      {modo === 'impuntuales' && (
        <FlatList
          data={impuntuales ?? []}
          keyExtractor={(item) => item.clave ?? item.vehiculoId}
          refreshControl={<RefreshControl refreshing={cargando} onRefresh={refrescar} />}
          contentContainerStyle={s.lista}
          ListHeaderComponent={
            errorImpuntuales ? (
              <Tarjeta style={{ borderColor: paleta.error }}>
                <Text style={{ color: paleta.error }}>{errorImpuntuales}</Text>
              </Tarjeta>
            ) : null
          }
          ListEmptyComponent={
            errorImpuntuales ? null : (
              <Text style={s.vacio}>
                {cargando ? t('trenes.cargandoImpuntualidad') : t('trenes.sinImpuntualidad')}
              </Text>
            )
          }
          initialNumToRender={8}
          renderItem={({ item }) => <FilaImpuntual dato={item} />}
        />
      )}
    </View>
  );
}

/**
 * Filas de las listas grandes, fuera del render de la pantalla y con
 * `React.memo`: al refrescar o escribir en el buscador solo se repinta lo que
 * ha cambiado de verdad (los datos de cada fila son referencias estables).
 */
const FilaEstacion = memo(function FilaEstacion({
  estacion,
  activa,
  onPulsar,
}: {
  estacion: EstacionResponse;
  activa: boolean;
  onPulsar: (nombre: string, estacion: EstacionResponse) => void;
}) {
  const { paleta } = useTema();
  const { t } = useTranslation();
  const s = useMemo(() => estilos(paleta), [paleta]);
  return (
    <Tarjeta style={{ borderColor: activa ? paleta.primario : undefined }}>
      <Pressable onPress={() => onPulsar(estacion.nombre, estacion)}>
        <Text style={s.nombre}>{estacion.nombre}</Text>
        <Text style={s.meta}>
          {t('trenes.tocaSalidas', {
            meta: `${estacion.codigo}${estacion.ciudad ? ` · ${estacion.ciudad}` : ''}`,
          })}
        </Text>
      </Pressable>
    </Tarjeta>
  );
});

const FilaHorario = memo(function FilaHorario({
  horario,
  origen,
  destino,
  fecha,
  onCrearAlerta,
}: {
  horario: HorarioTrenResponse;
  origen: string;
  destino: string;
  fecha: string;
  onCrearAlerta: (numeroTren: string) => void;
}) {
  const { paleta } = useTema();
  const { t } = useTranslation();
  const s = useMemo(() => estilos(paleta), [paleta]);
  return (
    <Tarjeta>
      <View style={s.fila}>
        <Text style={s.nombre}>{horario.numeroTren}</Text>
        <Etiqueta tono="primario">{horario.duracionMin} min</Etiqueta>
      </View>
      <Text style={s.meta}>
        {horaGtfs(horario.salida)}
        {' → '}
        {horaGtfs(horario.llegada)}
        {' · '}
        {horario.origenNombre} → {horario.destinoNombre}
      </Text>
      {horario.operador ? (
        esOuigo(horario.operador) ? (
          <Etiqueta tono="aviso">{horario.operador}</Etiqueta>
        ) : (
          <Text style={s.meta}>{horario.operador}</Text>
        )
      ) : null}
      {horario.transbordo ? (
        <View style={{ marginTop: 4, gap: 2 }}>
          <Etiqueta tono="primario">
            {t('trenes.transbordo', { estacion: horario.transbordo.estacion })}
          </Etiqueta>
          <Text style={s.meta}>
            {t('trenes.transbordoDetalle', {
              tren1: horario.transbordo.trenPrimera,
              hora1: horaGtfs(horario.transbordo.llegadaPrimera),
              espera: horario.transbordo.esperaMin,
              tren2: horario.transbordo.trenSegunda,
              hora2: horaGtfs(horario.transbordo.salidaSegunda),
            })}
          </Text>
        </View>
      ) : null}
      <Boton
        titulo={t('trenes.masAlerta')}
        variante="contorno"
        onPress={() => onCrearAlerta(horario.transbordo ? '' : horario.numeroTren)}
        style={{ marginTop: 8, alignSelf: 'flex-start' }}
      />
    </Tarjeta>
  );
});

const FilaPosicion = memo(function FilaPosicion({ posicion }: { posicion: PosicionTrenResponse }) {
  const { paleta } = useTema();
  const { t } = useTranslation();
  const s = useMemo(() => estilos(paleta), [paleta]);
  const indemnizacion =
    posicion.retrasoSeg != null ? funcionIndemnizacion(posicion.retrasoSeg) : null;
  return (
    <Tarjeta>
      <View style={s.fila}>
        <Text style={s.nombre}>{posicion.numeroTren ?? posicion.id}</Text>
        {posicion.cancelado ? <Etiqueta tono="error">{t('comunes.cancelado')}</Etiqueta> : null}
        {posicion.velocidadKmh != null ? (
          <Etiqueta>{Math.round(posicion.velocidadKmh)} km/h</Etiqueta>
        ) : null}
        {posicion.retrasoSeg != null ? (
          <Etiqueta tono={posicion.retrasoSeg >= 300 ? 'aviso' : 'exito'}>
            {posicion.retrasoSeg > 0
              ? `+${Math.round(posicion.retrasoSeg / 60)} min`
              : t('trenes.aTiempo')}
          </Etiqueta>
        ) : null}
      </View>
      {posicion.origenNombre && posicion.destinoNombre ? (
        <Text style={s.meta}>
          {posicion.origenNombre} → {posicion.destinoNombre}
        </Text>
      ) : null}
      {posicion.salida || posicion.llegada ? (
        <Text style={s.meta}>
          {posicion.salida ? t('trenes.salidaHora', { hora: horaGtfs(posicion.salida) }) : ''}
          {posicion.salida && posicion.llegada ? ' · ' : ''}
          {posicion.llegada ? t('trenes.llegadaHora', { hora: horaGtfs(posicion.llegada) }) : ''}
        </Text>
      ) : null}
      {posicion.operador ? <Text style={s.meta}>{posicion.operador}</Text> : null}
      {!posicion.origenNombre ? (
        <Text style={s.meta}>
          {posicion.latitud.toFixed(4)}, {posicion.longitud.toFixed(4)}
        </Text>
      ) : null}
      {indemnizacion ? (
        <Text style={s.indemnizacion}>
          {t('trenes.compromiso', { texto: indemnizacion.descripcion })}
        </Text>
      ) : null}
    </Tarjeta>
  );
});

const FilaImpuntual = memo(function FilaImpuntual({ dato }: { dato: PuntualidadTrenResponse }) {
  const { paleta } = useTema();
  const { t } = useTranslation();
  const s = useMemo(() => estilos(paleta), [paleta]);
  return (
    <Tarjeta>
      <View style={s.fila}>
        <Text style={s.nombre}>{dato.numeroTren ?? dato.vehiculoId}</Text>
        <Etiqueta tono="aviso">{t('trenes.veces', { n: dato.vecesImpuntuales })}</Etiqueta>
      </View>
      <Text style={s.meta}>
        {t('trenes.retrasoMedio', {
          medio: formatMinutos(dato.retrasoMedioSeg),
          peor: formatMinutos(dato.retrasoMaxSeg),
        })}
      </Text>
      {dato.origenNombre && dato.destinoNombre ? (
        <Text style={s.meta}>
          {dato.origenNombre} → {dato.destinoNombre}
        </Text>
      ) : null}
      {dato.salida ? (
        <Text style={s.meta}>
          {t('trenes.salidaHora', { hora: horaGtfs(dato.salida) })}
          {dato.fecha ? ` · ${dato.fecha}` : ''}
        </Text>
      ) : null}
      {dato.llegada || dato.llegadaEstimada ? (
        <Text style={s.meta}>
          {dato.llegada ? t('trenes.llegadaHora', { hora: horaGtfs(dato.llegada) }) : ''}
          {dato.llegada && dato.llegadaEstimada ? ' · ' : ''}
          {dato.llegadaEstimada
            ? t('trenes.llegadaEstimada', {
                hora: horaGtfs(dato.llegadaEstimada),
              })
            : ''}
        </Text>
      ) : null}
    </Tarjeta>
  );
});

const estilos = (c: Paleta) =>
  StyleSheet.create({
    pantalla: {
      flex: 1,
      backgroundColor: c.fondoSecundario,
    },
    encabezado: {
      backgroundColor: c.fondo,
      padding: espaciado.md,
      gap: espaciado.sm,
      borderBottomWidth: 1,
      borderBottomColor: c.borde,
    },
    titulo: {
      fontSize: 22,
      fontWeight: '800',
      color: c.texto,
    },
    modos: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: espaciado.sm,
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
    mesFila: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: espaciado.sm,
    },
    mesFlecha: {
      fontSize: 24,
      fontWeight: '700',
      color: c.primario,
      paddingHorizontal: espaciado.md,
      paddingVertical: 2,
    },
    mesFlechaInactiva: {
      color: c.borde,
    },
    mesNombre: {
      fontSize: 15,
      fontWeight: '700',
      color: c.texto,
      textTransform: 'capitalize',
    },
    formulario: {
      gap: 6,
    },
    campo: {
      borderWidth: 1,
      borderColor: c.borde,
      borderRadius: radio.md,
      paddingHorizontal: espaciado.md,
      paddingVertical: 10,
      fontSize: 15,
      color: c.texto,
      backgroundColor: c.fondoSecundario,
    },
    sugerencia: {
      fontSize: 14,
      color: c.primario,
      paddingVertical: 4,
      paddingHorizontal: 4,
    },
    lista: {
      padding: espaciado.md,
      gap: espaciado.sm,
    },
    salidasScroll: {
      maxHeight: MAX_ALTO_SALIDAS,
    },
    ficha: {
      gap: espaciado.xs,
      paddingVertical: espaciado.sm,
      borderTopWidth: 1,
      borderTopColor: c.borde,
    },
    botonMapa: {
      minHeight: 40,
      paddingVertical: 8,
      paddingHorizontal: 12,
      alignSelf: 'flex-start',
    },
    aforos: {
      gap: 2,
      marginTop: espaciado.xs,
    },
    fila: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: espaciado.sm,
    },
    nombre: {
      fontSize: 16,
      fontWeight: '700',
      color: c.texto,
    },
    meta: {
      fontSize: 13,
      color: c.textoSecundario,
    },
    indemnizacion: {
      fontSize: 13,
      fontWeight: '600',
      color: c.aviso,
    },
    vacio: {
      textAlign: 'center',
      color: c.textoSecundario,
      marginTop: espaciado.xl,
    },
    pieLista: {
      textAlign: 'center',
      color: c.textoSecundario,
      fontSize: 13,
      paddingVertical: espaciado.sm,
    },
  });
