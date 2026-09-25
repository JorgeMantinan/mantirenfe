import { useCallback, useMemo, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { FlatList, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';
import type {
  EstacionResponse,
  HorarioTrenResponse,
  PosicionTrenResponse,
} from '@mantirenfe/shared-types';
import { Boton } from '@/components/Boton';
import { Etiqueta, Tarjeta } from '@/components/Tarjeta';
import { api } from '@/lib/api';
import { colores, espaciado, radio } from '@/lib/tema';

type Modo = 'estaciones' | 'horarios' | 'posiciones';

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

  const [posiciones, setPosiciones] = useState<PosicionTrenResponse[]>([]);
  const [errorPosiciones, setErrorPosiciones] = useState<string | null>(null);

  const cargarEstaciones = useCallback((q?: string) => {
    setCargando(true);
    const query = q ? `&q=${encodeURIComponent(q)}` : '';
    api<EstacionResponse[]>(`/estaciones?limite=30${query}`)
      .then(setEstaciones)
      .catch(() => setEstaciones([]))
      .finally(() => setCargando(false));
  }, []);

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

  useFocusEffect(
    useCallback(() => {
      if (modo === 'estaciones') cargarEstaciones();
      if (modo === 'posiciones') cargarPosiciones();
    }, [modo, cargarEstaciones, cargarPosiciones]),
  );

  const filtradas = useMemo(() => {
    const texto = buscar.trim().toLowerCase();
    if (!texto) return estaciones;
    return estaciones.filter((e) => `${e.nombre} ${e.ciudad ?? ''}`.toLowerCase().includes(texto));
  }, [estaciones, buscar]);

  const sugerencias = (texto: string) => {
    const t = texto.trim().toLowerCase();
    if (t.length < 2) return [];
    return estaciones.filter((e) => e.nombre.toLowerCase().includes(t)).slice(0, 5);
  };

  const buscarHorarios = async () => {
    if (!origen.trim() || !destino.trim() || !fecha) return;
    setCargando(true);
    setErrorHorarios(null);
    try {
      const datos = await api<{ trenes: HorarioTrenResponse[] }>(
        `/trenes/horarios?origen=${encodeURIComponent(origen.trim())}&destino=${encodeURIComponent(destino.trim())}&fecha=${fecha}`,
      );
      setHorarios(datos.trenes);
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
  };

  return (
    <View style={estilos.pantalla}>
      <View style={estilos.encabezado}>
        <Text style={estilos.titulo}>Trenes</Text>
        <View style={estilos.modos}>
          {(
            [
              ['estaciones', 'Estaciones'],
              ['horarios', 'Horarios'],
              ['posiciones', 'Tiempo real'],
            ] as Array<[Modo, string]>
          ).map(([valor, etiqueta]) => (
            <Text
              key={valor}
              style={[estilos.modo, modo === valor && estilos.modoActivo]}
              onPress={() => setModo(valor)}
            >
              {etiqueta}
            </Text>
          ))}
        </View>

        {modo === 'estaciones' && (
          <TextInput
            style={estilos.campo}
            placeholder="Buscar estación..."
            placeholderTextColor={colores.textoSecundario}
            value={buscar}
            onChangeText={setBuscar}
          />
        )}

        {modo === 'horarios' && (
          <View style={estilos.formulario}>
            <TextInput
              style={estilos.campo}
              placeholder="Origen (ej. Madrid)"
              placeholderTextColor={colores.textoSecundario}
              value={origen}
              onChangeText={setOrigen}
            />
            {sugerencias(origen).map((e) => (
              <Text key={e.id} style={estilos.sugerencia} onPress={() => setOrigen(e.nombre)}>
                {e.nombre}
              </Text>
            ))}
            <TextInput
              style={estilos.campo}
              placeholder="Destino (ej. Sevilla)"
              placeholderTextColor={colores.textoSecundario}
              value={destino}
              onChangeText={setDestino}
            />
            {sugerencias(destino).map((e) => (
              <Text key={e.id} style={estilos.sugerencia} onPress={() => setDestino(e.nombre)}>
                {e.nombre}
              </Text>
            ))}
            <TextInput
              style={estilos.campo}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={colores.textoSecundario}
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

      {modo === 'estaciones' && (
        <FlatList
          data={filtradas}
          keyExtractor={(item) => item.id}
          refreshControl={<RefreshControl refreshing={cargando} onRefresh={() => refrescar()} />}
          contentContainerStyle={estilos.lista}
          renderItem={({ item }) => (
            <Tarjeta>
              <Text style={estilos.nombre}>{item.nombre}</Text>
              <Text style={estilos.meta}>
                {item.codigo}
                {item.ciudad ? ` · ${item.ciudad}` : ''}
              </Text>
            </Tarjeta>
          )}
          ListEmptyComponent={<Text style={estilos.vacio}>No se encontraron estaciones</Text>}
        />
      )}

      {modo === 'horarios' && (
        <FlatList
          data={horarios ?? []}
          keyExtractor={(item, index) => `${item.numeroTren}-${item.salida}-${index}`}
          refreshControl={<RefreshControl refreshing={cargando} onRefresh={() => refrescar()} />}
          contentContainerStyle={estilos.lista}
          ListHeaderComponent={
            errorHorarios ? (
              <Tarjeta style={{ borderColor: colores.error }}>
                <Text style={{ color: colores.error }}>{errorHorarios}</Text>
              </Tarjeta>
            ) : horarios && horarios.length === 0 ? (
              <Text style={estilos.vacio}>
                Sin trenes para esa ruta y fecha (ni directos ni con transbordo). Prueba otro día.
              </Text>
            ) : null
          }
          renderItem={({ item }) => (
            <Tarjeta>
              <View style={estilos.fila}>
                <Text style={estilos.nombre}>{item.numeroTren}</Text>
                <Etiqueta tono="primario">{item.duracionMin} min</Etiqueta>
              </View>
              <Text style={estilos.meta}>
                {new Date(item.salida).toLocaleTimeString('es-ES', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
                {' → '}
                {new Date(item.llegada).toLocaleTimeString('es-ES', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
                {' · '}
                {item.origenNombre} → {item.destinoNombre}
              </Text>
              {item.operador ? <Text style={estilos.meta}>{item.operador}</Text> : null}
              {item.transbordo ? (
                <View style={{ marginTop: 4, gap: 2 }}>
                  <Etiqueta tono="primario">Transbordo en {item.transbordo.estacion}</Etiqueta>
                  <Text style={estilos.meta}>
                    {item.transbordo.trenPrimera} llega a las{' '}
                    {new Date(item.transbordo.llegadaPrimera).toLocaleTimeString('es-ES', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                    {' · espera '}
                    {item.transbordo.esperaMin} min
                    {' · '}
                    {item.transbordo.trenSegunda} sale a las{' '}
                    {new Date(item.transbordo.salidaSegunda).toLocaleTimeString('es-ES', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </Text>
                </View>
              ) : null}
            </Tarjeta>
          )}
        />
      )}

      {modo === 'posiciones' && (
        <FlatList
          data={posiciones}
          keyExtractor={(item) => item.id}
          refreshControl={<RefreshControl refreshing={cargando} onRefresh={() => refrescar()} />}
          contentContainerStyle={estilos.lista}
          ListHeaderComponent={
            errorPosiciones ? (
              <Tarjeta style={{ borderColor: colores.error }}>
                <Text style={{ color: colores.error }}>{errorPosiciones}</Text>
              </Tarjeta>
            ) : posiciones.length === 0 ? (
              <Text style={estilos.vacio}>Sin posiciones GTFS-RT ahora mismo</Text>
            ) : null
          }
          renderItem={({ item }) => (
            <Tarjeta>
              <View style={estilos.fila}>
                <Text style={estilos.nombre}>{item.numeroTren ?? item.id}</Text>
                {item.velocidadKmh != null ? (
                  <Etiqueta>{Math.round(item.velocidadKmh)} km/h</Etiqueta>
                ) : null}
                {item.retrasoSeg != null ? (
                  <Etiqueta tono={item.retrasoSeg >= 300 ? 'aviso' : 'exito'}>
                    {item.retrasoSeg > 0 ? `+${Math.round(item.retrasoSeg / 60)} min` : 'A tiempo'}
                  </Etiqueta>
                ) : null}
              </View>
              <Text style={estilos.meta}>
                {item.latitud.toFixed(4)}, {item.longitud.toFixed(4)}
              </Text>
            </Tarjeta>
          )}
        />
      )}
    </View>
  );
}

const estilos = StyleSheet.create({
  pantalla: {
    flex: 1,
    backgroundColor: colores.fondoSecundario,
  },
  encabezado: {
    backgroundColor: colores.fondo,
    padding: espaciado.md,
    gap: espaciado.sm,
    borderBottomWidth: 1,
    borderBottomColor: colores.borde,
  },
  titulo: {
    fontSize: 22,
    fontWeight: '800',
    color: colores.texto,
  },
  modos: {
    flexDirection: 'row',
    gap: espaciado.sm,
  },
  modo: {
    fontSize: 13,
    fontWeight: '600',
    color: colores.textoSecundario,
    borderWidth: 1,
    borderColor: colores.borde,
    borderRadius: radio.completo,
    paddingHorizontal: 12,
    paddingVertical: 6,
    overflow: 'hidden',
  },
  modoActivo: {
    color: colores.primarioOscuro,
    borderColor: colores.primario,
    backgroundColor: colores.acento,
  },
  formulario: {
    gap: 6,
  },
  campo: {
    borderWidth: 1,
    borderColor: colores.borde,
    borderRadius: radio.md,
    paddingHorizontal: espaciado.md,
    paddingVertical: 10,
    fontSize: 15,
    color: colores.texto,
    backgroundColor: colores.fondoSecundario,
  },
  sugerencia: {
    fontSize: 14,
    color: colores.primario,
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
    color: colores.texto,
  },
  meta: {
    fontSize: 13,
    color: colores.textoSecundario,
  },
  vacio: {
    textAlign: 'center',
    color: colores.textoSecundario,
    marginTop: espaciado.xl,
  },
});
