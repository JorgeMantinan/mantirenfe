import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import {
  BONOS,
  INTERVALOS_SONDEO_MIN,
  horaGtfs,
  type EstacionResponse,
  type HorarioTrenResponse,
} from '@mantirenfe/shared-types';
import { Boton } from '@/components/Boton';
import { api } from '@/lib/api';
import { etiquetaBono, validarAlerta } from '@/lib/alertas';
import { colores, espaciado, radio } from '@/lib/tema';

export default function NuevaAlerta() {
  const [origen, setOrigen] = useState('');
  const [destino, setDestino] = useState('');
  const [fecha, setFecha] = useState('');
  const [intervalo, setIntervalo] = useState(10);
  const [bono, setBono] = useState<string>('GENERAL');
  const [notas, setNotas] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [estaciones, setEstaciones] = useState<EstacionResponse[]>([]);
  const [numeroTren, setNumeroTren] = useState('');
  const [trenesSugeridos, setTrenesSugeridos] = useState<HorarioTrenResponse[]>([]);

  const params = useLocalSearchParams<{
    origen?: string;
    destino?: string;
    fecha?: string;
    numeroTren?: string;
    editar?: string;
  }>();
  const editandoId = typeof params.editar === 'string' && params.editar ? params.editar : undefined;

  const fechaMin = useMemo(() => new Date().toISOString().slice(0, 10), []);

  // Precarga desde la búsqueda de trenes o carga completa en modo edición
  useEffect(() => {
    if (typeof params.origen === 'string' && params.origen) setOrigen(params.origen);
    if (typeof params.destino === 'string' && params.destino) setDestino(params.destino);
    if (typeof params.fecha === 'string' && params.fecha) setFecha(params.fecha);
    if (typeof params.numeroTren === 'string' && params.numeroTren)
      setNumeroTren(params.numeroTren);
    if (!editandoId) return;
    api<{
      origenNombre: string;
      destinoNombre: string;
      fechaViaje: string;
      horaDesde: string | null;
      horaHasta: string | null;
      numeroTren: string | null;
      intervaloSondeoMin: number;
      bono: string;
      notas: string | null;
    }>(`/alertas/${editandoId}`)
      .then((a) => {
        setOrigen(a.origenNombre);
        setDestino(a.destinoNombre);
        setFecha(a.fechaViaje);
        setIntervalo(a.intervaloSondeoMin);
        setBono(a.bono);
        setNotas(a.notas ?? '');
        setNumeroTren(a.numeroTren ?? '');
      })
      .catch(() => Alert.alert('Error', 'No se pudo cargar la alerta'));
  }, [params, editandoId]);

  // Los3 próximos trenes de la ruta
  const timerTrenes = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const peticionTrenes = useRef(0);
  useEffect(() => {
    clearTimeout(timerTrenes.current);
    if (origen.trim().length < 2 || destino.trim().length < 2 || !fecha) {
      setTrenesSugeridos([]);
      return;
    }
    timerTrenes.current = setTimeout(() => {
      const id = ++peticionTrenes.current;
      api<{ trenes: HorarioTrenResponse[] }>(
        `/trenes/horarios?origen=${encodeURIComponent(origen.trim())}&destino=${encodeURIComponent(destino.trim())}&fecha=${fecha}`,
      )
        .then((d) => {
          if (peticionTrenes.current !== id) return;
          const hoyIso = new Date().toISOString().slice(0, 10);
          const horaAhora = new Intl.DateTimeFormat('es-ES', {
            timeZone: 'Europe/Madrid',
            hour: '2-digit',
            minute: '2-digit',
            hourCycle: 'h23',
          }).format(new Date());
          const futuros = d.trenes.filter((t) => {
            if (t.transbordo) return false;
            if (fecha !== hoyIso) return true;
            return horaGtfs(t.salida) > horaAhora;
          });
          setTrenesSugeridos(futuros.slice(0, 3));
        })
        .catch(() => undefined);
    }, 400);
    return () => clearTimeout(timerTrenes.current);
  }, [origen, destino, fecha]);

  // Búsqueda remota con debounce: la lista fija de40 no incluía, p.ej., Vigo
  const timerBusqueda = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const peticionActual = useRef(0);

  const buscarEstaciones = (texto: string) => {
    clearTimeout(timerBusqueda.current);
    const q = texto.trim();
    if (q.length < 2) {
      setEstaciones([]);
      return;
    }
    timerBusqueda.current = setTimeout(() => {
      const id = ++peticionActual.current;
      api<EstacionResponse[]>(`/estaciones?q=${encodeURIComponent(q)}&limite=8`)
        .then((r) => {
          if (peticionActual.current === id) setEstaciones(r);
        })
        .catch(() => undefined);
    }, 250);
  };

  useEffect(() => () => clearTimeout(timerBusqueda.current), []);

  const sugerencias = () => estaciones.slice(0, 5);

  const enviar = async () => {
    const datos = {
      origenNombre: origen.trim(),
      destinoNombre: destino.trim(),
      fechaViaje: fecha,
      numeroTren: numeroTren.trim() || null,
      criterio: 'DISPONIBILIDAD' as const,
      intervaloSondeoMin: intervalo,
      bono,
      notas: notas.trim() || null,
    };

    const validacion = validarAlerta(datos);
    if (!validacion.success) {
      Alert.alert('Revisa los campos', validacion.error.issues[0]?.message ?? 'Datos inválidos');
      return;
    }

    setEnviando(true);
    try {
      await api(editandoId ? `/alertas/${editandoId}` : '/alertas', {
        method: editandoId ? 'PATCH' : 'POST',
        json: validacion.data,
      });
      Alert.alert(
        editandoId ? 'Alerta actualizada' : 'Alerta creada',
        editandoId ? 'Los cambios ya están aplicados.' : 'Empezamos a vigilar este trayecto.',
      );
      router.back();
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'No se pudo guardar la alerta');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <ScrollView style={estilos.pantalla} contentContainerStyle={estilos.contenido}>
      <Text style={estilos.titulo}>{editandoId ? 'Editar alerta' : 'Nueva alerta'}</Text>
      <Text style={estilos.subtitulo}>
        {editandoId
          ? 'Modifica cualquier dato; reiniciaremos los avisos si cambia la ruta'
          : 'Te avisaremos cuando cambie la disponibilidad de este trayecto'}
      </Text>

      <Text style={estilos.etiqueta}>Origen</Text>
      <TextInput
        style={estilos.campo}
        placeholder="Estación de origen"
        placeholderTextColor={colores.textoSecundario}
        value={origen}
        onChangeText={(v) => {
          setOrigen(v);
          buscarEstaciones(v);
        }}
      />
      {origen.trim().length >= 2 &&
        sugerencias().map((e) => (
          <Text key={e.id} style={estilos.sugerencia} onPress={() => setOrigen(e.nombre)}>
            {e.nombre}
          </Text>
        ))}

      <Text style={estilos.etiqueta}>Destino</Text>
      <TextInput
        style={estilos.campo}
        placeholder="Estación de destino"
        placeholderTextColor={colores.textoSecundario}
        value={destino}
        onChangeText={(v) => {
          setDestino(v);
          buscarEstaciones(v);
        }}
      />
      {destino.trim().length >= 2 &&
        sugerencias().map((e) => (
          <Text key={e.id} style={estilos.sugerencia} onPress={() => setDestino(e.nombre)}>
            {e.nombre}
          </Text>
        ))}

      <Text style={estilos.etiqueta}>Fecha del viaje</Text>
      <TextInput
        style={estilos.campo}
        placeholder="YYYY-MM-DD"
        placeholderTextColor={colores.textoSecundario}
        keyboardType="numbers-and-punctuation"
        value={fecha}
        onChangeText={setFecha}
      />
      <Text style={estilos.pista}>Mínimo: {fechaMin}</Text>

      <Text style={estilos.etiqueta}>Tren concreto (opcional)</Text>
      <TextInput
        style={estilos.campo}
        placeholder="Ej.: 03311 — vacío = todos los trenes"
        placeholderTextColor={colores.textoSecundario}
        value={numeroTren}
        onChangeText={setNumeroTren}
        autoCapitalize="characters"
      />
      {trenesSugeridos.length > 0 && !numeroTren.trim() && (
        <>
          <Text style={estilos.pista}>Próximos trenes (toca para elegir):</Text>
          <View style={estilos.chips}>
            {trenesSugeridos.map((t) => (
              <Text
                key={`${t.numeroTren}-${t.salida}`}
                style={[estilos.chip, numeroTren === t.numeroTren && estilos.chipActivo]}
                onPress={() => setNumeroTren(t.numeroTren)}
              >
                {horaGtfs(t.salida)} · {t.numeroTren}
              </Text>
            ))}
          </View>
        </>
      )}

      <Text style={estilos.etiqueta}>Intervalo de sondeo</Text>
      <View style={estilos.chips}>
        {INTERVALOS_SONDEO_MIN.map((min) => (
          <Text
            key={min}
            style={[estilos.chip, intervalo === min && estilos.chipActivo]}
            onPress={() => setIntervalo(min)}
          >
            {min} min
          </Text>
        ))}
      </View>

      <Text style={estilos.etiqueta}>Bono</Text>
      <View style={estilos.chips}>
        {BONOS.map((b) => (
          <Text
            key={b}
            style={[estilos.chip, bono === b && estilos.chipActivo]}
            onPress={() => setBono(b)}
          >
            {etiquetaBono(b)}
          </Text>
        ))}
      </View>
      <Text style={{ fontSize: 12, color: colores.textoSecundario }}>
        Guardamos tu perfil para personalizar los avisos. Renfe no publica las plazas por cupo de
        bono/abono: los avisos de disponibilidad se calculan sobre las tarifas generales.
      </Text>

      <Text style={estilos.etiqueta}>Notas (opcional)</Text>
      <TextInput
        style={[estilos.campo, estilos.notas]}
        placeholder="Ej. asiento junto a ventanilla..."
        placeholderTextColor={colores.textoSecundario}
        multiline
        value={notas}
        onChangeText={setNotas}
      />

      <Boton
        titulo={enviando ? 'Creando...' : 'Crear alerta'}
        onPress={() => void enviar()}
        cargando={enviando}
        style={{ marginTop: espaciado.sm }}
      />
    </ScrollView>
  );
}

const estilos = StyleSheet.create({
  pantalla: {
    flex: 1,
    backgroundColor: colores.fondo,
  },
  contenido: {
    padding: espaciado.lg,
    gap: espaciado.sm,
    paddingBottom: espaciado.xl * 2,
  },
  titulo: {
    fontSize: 24,
    fontWeight: '800',
    color: colores.texto,
  },
  subtitulo: {
    fontSize: 14,
    color: colores.textoSecundario,
    marginBottom: espaciado.sm,
  },
  etiqueta: {
    fontSize: 14,
    fontWeight: '600',
    color: colores.texto,
    marginTop: espaciado.sm,
  },
  campo: {
    borderWidth: 1,
    borderColor: colores.borde,
    borderRadius: radio.md,
    paddingHorizontal: espaciado.md,
    paddingVertical: 12,
    fontSize: 16,
    color: colores.texto,
    backgroundColor: colores.fondo,
  },
  notas: {
    minHeight: 88,
    textAlignVertical: 'top',
  },
  pista: {
    fontSize: 12,
    color: colores.textoSecundario,
  },
  sugerencia: {
    fontSize: 14,
    color: colores.primario,
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: espaciado.sm,
  },
  chip: {
    borderWidth: 1,
    borderColor: colores.borde,
    borderRadius: radio.completo,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    color: colores.textoSecundario,
    backgroundColor: colores.fondoSecundario,
    overflow: 'hidden',
  },
  chipActivo: {
    borderColor: colores.primario,
    backgroundColor: colores.acento,
    color: colores.primarioOscuro,
    fontWeight: '700',
  },
});
