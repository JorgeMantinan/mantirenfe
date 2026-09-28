import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import {
  esOuigo,
  funcionIndemnizacion,
  horaGtfs,
  type EstacionResponse,
  type HorarioTrenResponse,
  type HorariosResponse,
  type MotivoHorarios,
  type PosicionTrenResponse,
  type PuntualidadTrenResponse,
} from '@mantirenfe/shared-types';
import { Boton } from '@/components/Boton';
import { Etiqueta, Tarjeta } from '@/components/Tarjeta';
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
  etiqueta: string;
  desde: string | null;
  hasta: string | null;
}> = [
  { id: 'todo', etiqueta: 'Todo', desde: null, hasta: null },
  { id: 'manana', etiqueta: 'Mañana (06-12)', desde: '06:00', hasta: '12:00' },
  { id: 'tarde', etiqueta: 'Tarde (12-20)', desde: '12:00', hasta: '20:00' },
  { id: 'noche', etiqueta: 'Noche (20-24)', desde: '20:00', hasta: '24:00' },
];

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
  return new Date(`${mes}-02T00:00:00Z`).toLocaleDateString('es-ES', {
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

  const { paleta } = useTema();
  const s = useMemo(() => estilos(paleta), [paleta]);

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

  const cargarEstaciones = useCallback((q?: string) => {
    setCargando(true);
    const query = q ? `&q=${encodeURIComponent(q)}` : '';
    api<EstacionResponse[]>(`/estaciones?limite=30${query}`)
      .then(setEstaciones)
      .catch(() => setEstaciones([]))
      .finally(() => setCargando(false));
  }, []);

  const [salidas, setSalidas] = useState<HorarioTrenResponse[] | null>(null);
  const [cargandoSalidas, setCargandoSalidas] = useState(false);
  const [estacionSel, setEstacionSel] = useState('');

  const cargarSalidas = (nombre: string) => {
    const fecha = new Date().toISOString().slice(0, 10);
    setEstacionSel(nombre);
    setSalidas(null);
    setCargandoSalidas(true);
    api<HorarioTrenResponse[]>(
      `/trenes/estacion?estacion=${encodeURIComponent(nombre)}&fecha=${fecha}`,
    )
      .then(setSalidas)
      .catch(() => setSalidas([]))
      .finally(() => setCargandoSalidas(false));
  };

  // Búsqueda en el servidor mientras se escribe (la lista fija no incluía,
  // p.ej., estaciones como Arcade que empiezan pasadas las primeras30)
  const timerBusqueda = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const peticionBusqueda = useRef(0);
  const buscarEstacionesTexto = (texto: string) => {
    clearTimeout(timerBusqueda.current);
    const q = texto.trim();
    if (q.length < 2) {
      cargarEstaciones();
      return;
    }
    timerBusqueda.current = setTimeout(() => {
      const id = ++peticionBusqueda.current;
      api<EstacionResponse[]>(`/estaciones?limite=8&q=${encodeURIComponent(q)}`)
        .then((r) => {
          if (peticionBusqueda.current === id) setEstaciones(r);
        })
        .catch(() => undefined);
    }, 250);
  };

  useEffect(() => () => clearTimeout(timerBusqueda.current), []);

  // Sugerencias para el formulario de horarios: una lista por campo, para que
  // escribir en Destino no pinte también las sugerencias de Origen.
  const [sugOrigen, setSugOrigen] = useState<EstacionResponse[]>([]);
  const [sugDestino, setSugDestino] = useState<EstacionResponse[]>([]);
  const timerSugerencias = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const peticionSugerencias = useRef(0);

  /** Cierra las dos listas y cancela la petición pendiente (si la hay). */
  const limpiarSugerencias = () => {
    peticionSugerencias.current++;
    clearTimeout(timerSugerencias.current);
    setSugOrigen([]);
    setSugDestino([]);
  };

  const buscarSugerencias = (campo: 'origen' | 'destino', texto: string) => {
    clearTimeout(timerSugerencias.current);
    const set = campo === 'origen' ? setSugOrigen : setSugDestino;
    // Invalida cualquier respuesta pendiente y cierra la lista del otro campo
    peticionSugerencias.current++;
    (campo === 'origen' ? setSugDestino : setSugOrigen)([]);
    const q = texto.trim();
    if (q.length < 2) {
      set([]);
      return;
    }
    timerSugerencias.current = setTimeout(() => {
      const id = ++peticionSugerencias.current;
      api<EstacionResponse[]>(`/estaciones?limite=5&q=${encodeURIComponent(q)}`)
        .then((r) => {
          if (peticionSugerencias.current === id) set(r);
        })
        .catch(() => undefined);
    }, 250);
  };

  useEffect(() => () => clearTimeout(timerSugerencias.current), []);

  const cargarPosiciones = useCallback(() => {
    setCargando(true);
    api<{ trenes: PosicionTrenResponse[] }>('/trenes/posiciones')
      .then((d) => {
        setPosiciones(d.trenes);
        setErrorPosiciones(null);
      })
      .catch((e: Error) => setErrorPosiciones(e.message))
      .finally(() => setCargando(false));
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
      setErrorHorarios(e instanceof Error ? e.message : 'Error en la búsqueda');
      setHorarios(null);
    } finally {
      setCargando(false);
    }
  };

  const refrescar = () => {
    if (modo === 'estaciones') cargarEstaciones(buscar || undefined);
    if (modo === 'posiciones') cargarPosiciones();
    if (modo === 'horarios') void buscarHorarios();
    if (modo === 'impuntuales') cargarImpuntuales();
  };

  return (
    <View style={s.pantalla}>
      <View style={s.encabezado}>
        <Text style={s.titulo}>Trenes</Text>
        <View style={s.modos}>
          {(
            [
              ['estaciones', 'Estaciones'],
              ['horarios', 'Horarios'],
              ['posiciones', 'Tiempo real'],
              ['impuntuales', 'Impuntuales'],
            ] as Array<[Modo, string]>
          ).map(([valor, etiqueta]) => (
            <Text
              key={valor}
              style={[s.modo, modo === valor && s.modoActivo]}
              onPress={() => setModo(valor)}
            >
              {etiqueta}
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
              {(
                [
                  ['veces', 'Más veces'],
                  ['impuntualidad', 'Mayor retraso'],
                ] as Array<[OrdenImpuntuales, string]>
              ).map(([valor, etiqueta]) => (
                <Text
                  key={valor}
                  style={[s.modo, orden === valor && s.modoActivo]}
                  onPress={() => setOrden(valor)}
                >
                  {etiqueta}
                </Text>
              ))}
            </View>
          </>
        )}

        {modo === 'estaciones' && (
          <TextInput
            style={s.campo}
            placeholder="Buscar estación..."
            placeholderTextColor={paleta.textoSecundario}
            value={buscar}
            onChangeText={(v) => {
              setBuscar(v);
              buscarEstacionesTexto(v);
            }}
          />
        )}

        {modo === 'posiciones' && (
          <TextInput
            style={s.campo}
            placeholder="Filtrar trenes (nº, origen, destino)..."
            placeholderTextColor={paleta.textoSecundario}
            value={filtroPos}
            onChangeText={setFiltroPos}
          />
        )}

        {modo === 'posiciones' && (
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
            {(
              [
                ['lista', 'list', 'Lista'],
                ['mapa', 'map', 'Mapa'],
              ] as const
            ).map(([valor, icono, etiqueta]) => (
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
              placeholder="Origen (ej. Madrid)"
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
              placeholder="Destino (ej. Sevilla)"
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
              titulo={cargando ? 'Buscando...' : 'Buscar horarios'}
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
              {cargandoSalidas ? 'Cargando salidas...' : `Salidas de ${estacionSel} hoy`}
            </Text>
            <Text
              style={{ color: paleta.primario, fontWeight: '600' }}
              onPress={() => {
                setSalidas(null);
                setEstacionSel('');
              }}
            >
              Cerrar
            </Text>
          </View>
          {!cargandoSalidas && (salidas ?? []).length === 0 ? (
            <Text style={s.meta}>Sin salidas registradas hoy</Text>
          ) : (
            (salidas ?? []).map((salida, i) => (
              <View key={`${salida.numeroTren}-${salida.salida}-${i}`} style={{ marginTop: 6 }}>
                <Text style={s.nombre}>
                  {horaGtfs(salida.salida)} · {salida.numeroTren}
                </Text>
                <Text style={s.meta}>
                  {salida.origenNombre} → {salida.destinoNombre}
                  {salida.operador ? ` · ${salida.operador}` : ''}
                </Text>
              </View>
            ))
          )}
        </Tarjeta>
      )}

      {modo === 'estaciones' && (
        <FlatList
          data={estaciones}
          keyExtractor={(item) => item.id}
          refreshControl={<RefreshControl refreshing={cargando} onRefresh={() => refrescar()} />}
          contentContainerStyle={s.lista}
          renderItem={({ item }) => (
            <Tarjeta
              style={{ borderColor: estacionSel === item.nombre ? paleta.primario : undefined }}
            >
              <Pressable onPress={() => cargarSalidas(item.nombre)}>
                <Text style={s.nombre}>{item.nombre}</Text>
                <Text style={s.meta}>
                  {item.codigo}
                  {item.ciudad ? ` · ${item.ciudad}` : ''} — toca para ver salidas
                </Text>
              </Pressable>
            </Tarjeta>
          )}
          ListEmptyComponent={<Text style={s.vacio}>No se encontraron estaciones</Text>}
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
                    ? 'Estación no encontrada'
                    : 'Sin trenes con esa ruta'}
                </Text>
                <Text style={[s.meta, { marginTop: 4 }]}>
                  {motivoHorarios === 'estaciones'
                    ? `No encontramos la estación ${
                        sinEstacion.length > 0
                          ? sinEstacion.map((n) => `«${n}»`).join(' y ')
                          : 'indicada'
                      }. Revisa el nombre (tildes, «La Coruña» = «A Coruña»).`
                    : `Sin trenes directos ni con conexión de ${origen} a ${destino} para el ${fecha}. Prueba otro día o divide el viaje en dos tramos.`}
                </Text>
                {motivoHorarios === 'estaciones' ? null : (
                  <Boton
                    titulo="Crear alerta de disponibilidad"
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
                      {f.etiqueta}
                    </Text>
                  ))}
                </View>
                <Text style={s.meta}>
                  Mostrando {horariosVisibles.length} de {horarios.length} salidas
                </Text>
                {horariosVisibles.length === 0 ? (
                  <Tarjeta>
                    <Text style={s.nombre}>Ninguna salida en esa franja</Text>
                    <Text style={[s.meta, { marginTop: 4 }]}>
                      Prueba otra franja o vuelve a «Todo».
                    </Text>
                  </Tarjeta>
                ) : null}
              </View>
            ) : null
          }
          renderItem={({ item }) => (
            <Tarjeta>
              <View style={s.fila}>
                <Text style={s.nombre}>{item.numeroTren}</Text>
                <Etiqueta tono="primario">{item.duracionMin} min</Etiqueta>
              </View>
              <Text style={s.meta}>
                {horaGtfs(item.salida)}
                {' → '}
                {horaGtfs(item.llegada)}
                {' · '}
                {item.origenNombre} → {item.destinoNombre}
              </Text>
              {item.operador ? (
                esOuigo(item.operador) ? (
                  <Etiqueta tono="aviso">{item.operador}</Etiqueta>
                ) : (
                  <Text style={s.meta}>{item.operador}</Text>
                )
              ) : null}
              {item.transbordo ? (
                <View style={{ marginTop: 4, gap: 2 }}>
                  <Etiqueta tono="primario">Transbordo en {item.transbordo.estacion}</Etiqueta>
                  <Text style={s.meta}>
                    {item.transbordo.trenPrimera} llega a las{' '}
                    {horaGtfs(item.transbordo.llegadaPrimera)}
                    {' · espera '}
                    {item.transbordo.esperaMin} min
                    {' · '}
                    {item.transbordo.trenSegunda} sale a las{' '}
                    {horaGtfs(item.transbordo.salidaSegunda)}
                  </Text>
                </View>
              ) : null}
              <Boton
                titulo="+ Alerta"
                variante="contorno"
                onPress={() =>
                  router.push({
                    pathname: '/alertas/nueva',
                    params: {
                      origen,
                      destino,
                      fecha,
                      numeroTren: item.transbordo ? '' : item.numeroTren,
                    },
                  })
                }
                style={{ marginTop: 8, alignSelf: 'flex-start' }}
              />
            </Tarjeta>
          )}
        />
      )}

      {modo === 'posiciones' && vistaPos === 'mapa' && (
        <View style={{ flex: 1 }}>
          {errorPosiciones ? (
            <Text style={[s.vacio, { color: paleta.error }]}>{errorPosiciones}</Text>
          ) : null}
          <WebView
            source={{ uri: 'https://mantirenfe.vercel.app/mapa' }}
            style={{ flex: 1 }}
            startInLoadingState
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
              <Text style={s.vacio}>Sin posiciones GTFS-RT ahora mismo</Text>
            ) : posicionesVisibles.length === 0 ? (
              <Text style={s.vacio}>Sin trenes que coincidan con «{filtroPos}»</Text>
            ) : null
          }
          renderItem={({ item }) => {
            const indemnizacion =
              item.retrasoSeg != null ? funcionIndemnizacion(item.retrasoSeg) : null;
            return (
              <Tarjeta>
                <View style={s.fila}>
                  <Text style={s.nombre}>{item.numeroTren ?? item.id}</Text>
                  {item.cancelado ? <Etiqueta tono="error">Cancelado</Etiqueta> : null}
                  {item.velocidadKmh != null ? (
                    <Etiqueta>{Math.round(item.velocidadKmh)} km/h</Etiqueta>
                  ) : null}
                  {item.retrasoSeg != null ? (
                    <Etiqueta tono={item.retrasoSeg >= 300 ? 'aviso' : 'exito'}>
                      {item.retrasoSeg > 0
                        ? `+${Math.round(item.retrasoSeg / 60)} min`
                        : 'A tiempo'}
                    </Etiqueta>
                  ) : null}
                </View>
                {item.origenNombre && item.destinoNombre ? (
                  <Text style={s.meta}>
                    {item.origenNombre} → {item.destinoNombre}
                  </Text>
                ) : null}
                {item.salida || item.llegada ? (
                  <Text style={s.meta}>
                    {item.salida ? `Salida ${horaGtfs(item.salida)}` : ''}
                    {item.salida && item.llegada ? ' · ' : ''}
                    {item.llegada ? `Llegada ${horaGtfs(item.llegada)}` : ''}
                  </Text>
                ) : null}
                {item.operador ? <Text style={s.meta}>{item.operador}</Text> : null}
                {!item.origenNombre ? (
                  <Text style={s.meta}>
                    {item.latitud.toFixed(4)}, {item.longitud.toFixed(4)}
                  </Text>
                ) : null}
                {indemnizacion ? (
                  <Text style={s.indemnizacion}>
                    Compromiso de Renfe: {indemnizacion.descripcion}
                  </Text>
                ) : null}
              </Tarjeta>
            );
          }}
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
                {cargando ? 'Cargando impuntualidad…' : 'Aún sin datos de impuntualidad este mes'}
              </Text>
            )
          }
          renderItem={({ item }) => (
            <Tarjeta>
              <View style={s.fila}>
                <Text style={s.nombre}>{item.numeroTren ?? item.vehiculoId}</Text>
                <Etiqueta tono="aviso">{item.vecesImpuntuales} veces</Etiqueta>
              </View>
              <Text style={s.meta}>
                Retraso medio {formatMinutos(item.retrasoMedioSeg)} · Peor{' '}
                {formatMinutos(item.retrasoMaxSeg)}
              </Text>
              {item.origenNombre && item.destinoNombre ? (
                <Text style={s.meta}>
                  {item.origenNombre} → {item.destinoNombre}
                </Text>
              ) : null}
              {item.salida ? (
                <Text style={s.meta}>
                  Salida {horaGtfs(item.salida)}
                  {item.fecha ? ` · ${item.fecha}` : ''}
                </Text>
              ) : null}
              {item.llegada || item.llegadaEstimada ? (
                <Text style={s.meta}>
                  {item.llegada ? `Llegada ${horaGtfs(item.llegada)}` : ''}
                  {item.llegada && item.llegadaEstimada ? ' · ' : ''}
                  {item.llegadaEstimada
                    ? `estimada ${horaGtfs(item.llegadaEstimada)} (máx. retraso)`
                    : ''}
                </Text>
              ) : null}
            </Tarjeta>
          )}
        />
      )}
    </View>
  );
}

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
  });
