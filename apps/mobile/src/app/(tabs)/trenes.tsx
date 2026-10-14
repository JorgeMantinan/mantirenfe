import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { Pressable, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import {
  type EstacionDetalleResponse,
  type EstacionResponse,
  type HorarioTrenResponse,
  type HorariosResponse,
  type MotivoHorarios,
  type PosicionTrenResponse,
  type PuntualidadTrenResponse,
} from '@mantirenfe/shared-types';
import { Boton } from '@/components/Boton';
import { CampoHora } from '@/components/alertas/CampoHora';
import { BotonElegirFecha, SelectorFechaNativa } from '@/components/alertas/SelectorFechaNativa';
import { EstacionesVista } from '@/components/trenes/EstacionesVista';
import { HorariosVista, type FranjaSalida } from '@/components/trenes/HorariosVista';
import { ImpuntualesVista } from '@/components/trenes/ImpuntualesVista';
import { PosicionesVista } from '@/components/trenes/PosicionesVista';
import { estilosTrenes } from '@/components/trenes/estilos';
import { useSugerenciasEstacion } from '@/hooks/useSugerenciasEstacion';
import { locale } from '@/i18n';
import { api } from '@/lib/api';
import { useTema } from '@/lib/tema-contexto';

type Modo = 'estaciones' | 'horarios' | 'posiciones' | 'impuntuales';
type OrdenImpuntuales = 'veces' | 'impuntualidad';

/** Filas por página del listado de estaciones (scroll infinito con offset). */
const PAGINA_ESTACIONES = 20;

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

export default function Trenes() {
  const [modo, setModo] = useState<Modo>('estaciones');
  const [estaciones, setEstaciones] = useState<EstacionResponse[]>([]);
  const [buscar, setBuscar] = useState('');
  // Un spinner por modo: cada `cargar*` solo apaga SU bandera, así un modo
  // lento no para el RefreshControl ni el «buscando…» de otro modo.
  const [cargandoPorModo, setCargandoPorModo] = useState<Record<Modo, boolean>>({
    estaciones: false,
    horarios: false,
    posiciones: false,
    impuntuales: false,
  });
  const marcarCargando = useCallback((m: Modo, activo: boolean) => {
    setCargandoPorModo((prev) => (prev[m] === activo ? prev : { ...prev, [m]: activo }));
  }, []);

  const [origen, setOrigen] = useState('');
  const [destino, setDestino] = useState('');
  const [fecha, setFecha] = useState(() => new Date().toISOString().slice(0, 10));
  // Franja horaria propia del formulario (HH:MM, vacía = sin límite): filtra
  // los resultados como en la web, con reloj nativo para elegir cada hora.
  const [franjaDesde, setFranjaDesde] = useState('');
  const [franjaHasta, setFranjaHasta] = useState('');
  const [calendarioAbierto, setCalendarioAbierto] = useState(false);
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
  const { t } = useTranslation();
  const s = useMemo(() => estilosTrenes(paleta), [paleta]);

  const etiquetasModo: Record<Modo, string> = {
    estaciones: t('trenes.modo.estaciones'),
    horarios: t('trenes.modo.horarios'),
    posiciones: t('trenes.modo.posiciones'),
    impuntuales: t('trenes.modo.impuntuales'),
  };
  const etiquetasOrden: Record<OrdenImpuntuales, string> = {
    veces: t('trenes.orden.veces'),
    impuntualidad: t('trenes.orden.retraso'),
  };
  const vistas: Array<['lista' | 'mapa', 'list' | 'map', string]> = [
    ['lista', 'list', t('trenes.vistaLista')],
    ['mapa', 'map', t('trenes.vistaMapa')],
  ];

  // Listado de estaciones paginado: `reset` vuelve al principio (foco, refresh
  // o búsqueda nueva) y sin `reset` añade la página siguiente (+20).
  const [cargandoMasEstaciones, setCargandoMasEstaciones] = useState(false);
  const [hayMasEstaciones, setHayMasEstaciones] = useState(true);
  const offsetEstaciones = useRef(0);
  const consultaEstaciones = useRef('');
  const cargandoPaginaEstaciones = useRef(false);
  const recargaEstacionesVuelo = useRef(false);
  const peticionEstaciones = useRef(0);

  const cargarEstaciones = useCallback(
    (q?: string, reset = true) => {
      const texto = q?.trim();
      if (reset) {
        setHayMasEstaciones(true);
        marcarCargando('estaciones', true);
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
          marcarCargando('estaciones', false);
          setCargandoMasEstaciones(false);
        });
    },
    [marcarCargando],
  );

  /** Siguiente página: pagina sobre la consulta con la que se cargó la lista. */
  const cargarMasEstaciones = () => {
    if (cargandoPorModo.estaciones || cargandoMasEstaciones || !hayMasEstaciones) return;
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
    marcarCargando('posiciones', true);
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
        marcarCargando('posiciones', false);
      });
  }, [marcarCargando]);

  // Depende de mes/orden: useFocusEffect se vuelve a ejecutar al cambiarlos (y al
  // recuperar el foco), así que no hace falta un useEffect aparte que duplique la llamada.
  const peticionImpuntuales = useRef(0);
  const cargarImpuntuales = useCallback(() => {
    const peticion = ++peticionImpuntuales.current;
    setImpuntuales(null);
    setErrorImpuntuales(null);
    marcarCargando('impuntuales', true);
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
        if (peticion === peticionImpuntuales.current) marcarCargando('impuntuales', false);
      });
  }, [mes, orden, marcarCargando]);

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
    marcarCargando('horarios', true);
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
      marcarCargando('horarios', false);
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

  // Referencia estable del rango escrito a mano en el formulario
  const rangoCustom = useMemo(
    () => ({ desde: franjaDesde, hasta: franjaHasta }),
    [franjaDesde, franjaHasta],
  );

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
            <BotonElegirFecha onPress={() => setCalendarioAbierto(true)} />
            <SelectorFechaNativa
              campo={calendarioAbierto ? 'ida' : null}
              valor={fecha}
              minimo={new Date().toISOString().slice(0, 10)}
              onCerrar={() => setCalendarioAbierto(false)}
              onElegir={(iso) => {
                setFecha(iso);
                setCalendarioAbierto(false);
              }}
            />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <CampoHora
                valor={franjaDesde}
                onValor={setFranjaDesde}
                placeholder={t('nueva.desdeHora')}
                flexible
              />
              <CampoHora
                valor={franjaHasta}
                onValor={setFranjaHasta}
                placeholder={t('nueva.hastaHora')}
                flexible
              />
            </View>
            <Boton
              titulo={cargandoPorModo.horarios ? t('trenes.buscando') : t('trenes.buscarHorarios')}
              onPress={() => void buscarHorarios()}
              cargando={cargandoPorModo.horarios}
            />
          </View>
        )}
      </View>

      {modo === 'estaciones' && (
        <EstacionesVista
          cargando={cargandoPorModo.estaciones}
          estaciones={estaciones}
          cargandoMas={cargandoMasEstaciones}
          onRefrescar={refrescar}
          onCargarMas={cargarMasEstaciones}
          estacionSel={estacionSel}
          onElegirEstacion={cargarSalidas}
          salidas={salidas}
          cargandoSalidas={cargandoSalidas}
          errorSalidas={errorSalidas}
          detalle={detalle}
          detalleListo={detalleListo}
          coordsSel={coordsSel}
          onCerrarSalidas={cerrarSalidas}
        />
      )}

      {modo === 'horarios' && (
        <HorariosVista
          cargando={cargandoPorModo.horarios}
          horarios={horarios}
          errorHorarios={errorHorarios}
          motivoHorarios={motivoHorarios}
          sinEstacion={sinEstacion}
          franjaSalida={franjaSalida}
          onFranjaSalida={setFranjaSalida}
          rangoCustom={rangoCustom}
          onQuitarRango={() => {
            setFranjaDesde('');
            setFranjaHasta('');
          }}
          origen={origen}
          destino={destino}
          fecha={fecha}
          onCrearAlerta={crearAlertaHorario}
          onRefrescar={refrescar}
        />
      )}

      {modo === 'posiciones' && (
        <PosicionesVista
          cargando={cargandoPorModo.posiciones}
          posiciones={posiciones}
          errorPosiciones={errorPosiciones}
          filtro={filtroPos}
          vista={vistaPos}
          onRefrescar={refrescar}
        />
      )}

      {modo === 'impuntuales' && (
        <ImpuntualesVista
          cargando={cargandoPorModo.impuntuales}
          datos={impuntuales}
          error={errorImpuntuales}
          onRefrescar={refrescar}
        />
      )}
    </View>
  );
}
