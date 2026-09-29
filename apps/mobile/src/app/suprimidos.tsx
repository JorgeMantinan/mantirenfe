import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { fechaGtfs, type EstacionResponse, type SuprimidoResponse } from '@mantirenfe/shared-types';
import { Boton } from '@/components/Boton';
import { Etiqueta, Tarjeta } from '@/components/Tarjeta';
import { api } from '@/lib/api';
import { useTema } from '@/lib/tema-contexto';
import { espaciado, radio, type Paleta } from '@/lib/tema';

const RE_FECHA = /^\d{4}-\d{2}-\d{2}$/;

/** Días de histórico que conserva la API (el worker poda a los 7). */
const DIAS_HISTORICO = 7;

function restarDias(fecha: string, dias: number): string {
  const [anio, mes, dia] = fecha.split('-').map(Number);
  return new Date(Date.UTC(anio ?? 1970, (mes ?? 1) - 1, (dia ?? 1) - dias))
    .toISOString()
    .slice(0, 10);
}

/** Fecha consultable: entre hace 7 días y hoy (peninsular). */
function esFechaValida(valor: string): boolean {
  if (!RE_FECHA.test(valor)) return false;
  if (Number.isNaN(new Date(`${valor}T00:00:00Z`).getTime())) return false;
  const hoy = fechaGtfs();
  return valor >= restarDias(hoy, DIAS_HISTORICO) && valor <= hoy;
}

export default function Suprimidos() {
  const [fecha, setFecha] = useState(fechaGtfs);
  const [texto, setTexto] = useState('');
  const [estacion, setEstacion] = useState('');
  const [sugerencias, setSugerencias] = useState<EstacionResponse[]>([]);
  const [datos, setDatos] = useState<SuprimidoResponse[] | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { paleta } = useTema();
  const s = useMemo(() => estilos(paleta), [paleta]);

  const fechaValida = esFechaValida(fecha);
  const fechaMinima = useMemo(() => restarDias(fechaGtfs(), DIAS_HISTORICO), []);

  const cargar = useCallback(() => {
    setCargando(true);
    setError(null);
    const params = new URLSearchParams({ fecha });
    if (estacion.trim()) params.set('estacion', estacion.trim());
    api<SuprimidoResponse[]>(`/suprimidos?${params.toString()}`)
      .then((respuesta) => {
        setDatos(respuesta);
        setError(null);
      })
      .catch((e: Error) => {
        setError(e.message);
        setDatos(null);
      })
      .finally(() => setCargando(false));
  }, [fecha, estacion]);

  useEffect(() => {
    if (!fechaValida) {
      setDatos(null);
      setError(null);
      return;
    }
    cargar();
  }, [cargar, fechaValida]);

  // Autocompletado con debounce (mismo patrón que la búsqueda de trenes)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const peticion = useRef(0);
  useEffect(() => () => clearTimeout(timer.current), []);

  const sugerir = (valor: string) => {
    setTexto(valor);
    clearTimeout(timer.current);
    const q = valor.trim();
    if (q.length < 2) {
      setSugerencias([]);
      return;
    }
    timer.current = setTimeout(() => {
      const id = ++peticion.current;
      api<EstacionResponse[]>(`/estaciones?q=${encodeURIComponent(q)}&limite=5`)
        .then((r) => {
          if (peticion.current === id) setSugerencias(r);
        })
        .catch(() => {
          if (peticion.current === id) setSugerencias([]);
        });
    }, 250);
  };

  return (
    <FlatList
      style={s.pantalla}
      data={datos ?? []}
      keyExtractor={(fila) => fila.tripId}
      refreshControl={
        <RefreshControl
          refreshing={cargando}
          onRefresh={() => {
            if (fechaValida) cargar();
          }}
        />
      }
      contentContainerStyle={s.lista}
      ListHeaderComponent={
        <Tarjeta>
          <View style={s.filaTitulo}>
            <Ionicons name="remove-circle-outline" size={20} color={paleta.primario} />
            <Text style={s.titulo}>Consultar supresiones</Text>
          </View>
          <Text style={s.etiqueta}>Fecha (YYYY-MM-DD)</Text>
          <TextInput
            style={s.campo}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={paleta.textoSecundario}
            keyboardType="numbers-and-punctuation"
            maxLength={10}
            value={fecha}
            onChangeText={setFecha}
          />
          <Text style={fechaValida ? s.pista : s.pistaError}>
            {fechaValida
              ? `Histórico disponible: desde el ${fechaMinima}`
              : `Fecha no válida: usa YYYY-MM-DD entre el ${fechaMinima} y hoy`}
          </Text>

          <Text style={s.etiqueta}>Estación (opcional)</Text>
          <TextInput
            style={s.campo}
            placeholder="Madrid-Atocha"
            placeholderTextColor={paleta.textoSecundario}
            value={texto}
            onChangeText={sugerir}
          />
          {sugerencias.map((e) => (
            <Text
              key={e.id}
              style={s.sugerencia}
              onPress={() => {
                setTexto(e.nombre);
                setSugerencias([]);
                setEstacion(e.nombre);
              }}
            >
              {e.nombre}
              {e.ciudad ? ` · ${e.ciudad}` : ''}
            </Text>
          ))}
          {estacion ? (
            <Boton
              titulo={`Quitar filtro de ${estacion}`}
              variante="contorno"
              onPress={() => {
                setTexto('');
                setSugerencias([]);
                setEstacion('');
              }}
              style={{ minHeight: 40, paddingVertical: 8 }}
            />
          ) : null}

          <Boton
            titulo={cargando ? 'Buscando...' : 'Buscar'}
            onPress={cargar}
            cargando={cargando}
            disabled={!fechaValida}
          />
          {error ? <Text style={s.errorApi}>{error}</Text> : null}
        </Tarjeta>
      }
      ListEmptyComponent={
        !fechaValida ? null : cargando ? (
          <Text style={s.vacio}>Buscando supresiones…</Text>
        ) : (
          <Tarjeta>
            <Text style={s.vacioTitulo}>
              Sin trenes suprimidos en esa fecha (cubrimos Larga Distancia; Cercanías cancela rara
              veces)
            </Text>
          </Tarjeta>
        )
      }
      renderItem={({ item }) => (
        <Tarjeta>
          <View style={s.fila}>
            <Text style={s.nombre}>
              {item.salida ?? '--:--'} · {item.numeroTren ? `tren ${item.numeroTren}` : 'tren —'}
            </Text>
            {!item.origen || !item.destino || !item.salida || !item.llegada ? (
              <Etiqueta tono="aviso">Sin datos</Etiqueta>
            ) : null}
          </View>
          <Text style={s.meta}>
            {item.origen ?? '—'} → {item.destino ?? '—'}
          </Text>
          {item.llegada ? <Text style={s.meta}>Llegada {item.llegada}</Text> : null}
        </Tarjeta>
      )}
    />
  );
}

const estilos = (c: Paleta) =>
  StyleSheet.create({
    pantalla: {
      flex: 1,
      backgroundColor: c.fondoSecundario,
    },
    lista: {
      padding: espaciado.md,
      gap: espaciado.sm,
    },
    filaTitulo: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: espaciado.sm,
    },
    titulo: {
      fontSize: 16,
      fontWeight: '700',
      color: c.texto,
    },
    etiqueta: {
      fontSize: 14,
      fontWeight: '600',
      color: c.texto,
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
    pista: {
      fontSize: 12,
      color: c.textoSecundario,
    },
    pistaError: {
      fontSize: 12,
      color: c.error,
    },
    errorApi: {
      fontSize: 13,
      color: c.error,
    },
    sugerencia: {
      fontSize: 14,
      color: c.primario,
      paddingVertical: 4,
      paddingHorizontal: 4,
    },
    fila: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: espaciado.sm,
    },
    nombre: {
      flex: 1,
      fontSize: 16,
      fontWeight: '700',
      color: c.texto,
    },
    meta: {
      fontSize: 13,
      color: c.textoSecundario,
    },
    vacio: {
      textAlign: 'center',
      color: c.textoSecundario,
      marginTop: espaciado.lg,
    },
    vacioTitulo: {
      fontSize: 14,
      color: c.textoSecundario,
      textAlign: 'center',
    },
  });
