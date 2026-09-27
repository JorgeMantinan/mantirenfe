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
import { useTema } from '@/lib/tema-contexto';
import { espaciado, radio, type Paleta } from '@/lib/tema';

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
  const { paleta } = useTema();
  const s = useMemo(() => estilos(paleta), [paleta]);

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
    <ScrollView style={s.pantalla} contentContainerStyle={s.contenido}>
      <Text style={s.titulo}>{editandoId ? 'Editar alerta' : 'Nueva alerta'}</Text>
      <Text style={s.subtitulo}>
        {editandoId
          ? 'Modifica cualquier dato; reiniciaremos los avisos si cambia la ruta'
          : 'Te avisaremos cuando cambie la disponibilidad de este trayecto'}
      </Text>

      <Text style={s.etiqueta}>Origen</Text>
      <TextInput
        style={s.campo}
        placeholder="Estación de origen"
        placeholderTextColor={paleta.textoSecundario}
        value={origen}
        onChangeText={(v) => {
          setOrigen(v);
          buscarEstaciones(v);
          setNumeroTren(''); // la ruta cambió: el tren elegido ya no aplica
        }}
      />
      {origen.trim().length >= 2 &&
        sugerencias().map((e) => (
          <Text key={e.id} style={s.sugerencia} onPress={() => setOrigen(e.nombre)}>
            {e.nombre}
          </Text>
        ))}

      <Text style={s.etiqueta}>Destino</Text>
      <TextInput
        style={s.campo}
        placeholder="Estación de destino"
        placeholderTextColor={paleta.textoSecundario}
        value={destino}
        onChangeText={(v) => {
          setDestino(v);
          buscarEstaciones(v);
          setNumeroTren('');
        }}
      />
      {destino.trim().length >= 2 &&
        sugerencias().map((e) => (
          <Text key={e.id} style={s.sugerencia} onPress={() => setDestino(e.nombre)}>
            {e.nombre}
          </Text>
        ))}

      <Text style={s.etiqueta}>Fecha del viaje</Text>
      <TextInput
        style={s.campo}
        placeholder="YYYY-MM-DD"
        placeholderTextColor={paleta.textoSecundario}
        keyboardType="numbers-and-punctuation"
        value={fecha}
        onChangeText={(v) => {
          setFecha(v);
          setNumeroTren(''); // el tren elegido es de otra fecha
        }}
      />
      <Text style={s.pista}>Mínimo: {fechaMin}</Text>

      <Text style={s.etiqueta}>Tren concreto (opcional)</Text>
      <TextInput
        style={s.campo}
        placeholder="Ej.: 03311 — vacío = todos los trenes"
        placeholderTextColor={paleta.textoSecundario}
        value={numeroTren}
        onChangeText={setNumeroTren}
        autoCapitalize="characters"
      />
      {trenesSugeridos.length > 0 && !numeroTren.trim() && (
        <>
          <Text style={s.pista}>Próximos trenes (toca para elegir):</Text>
          <View style={s.chips}>
            {trenesSugeridos.map((t) => (
              <Text
                key={`${t.numeroTren}-${t.salida}`}
                style={[s.chip, numeroTren === t.numeroTren && s.chipActivo]}
                onPress={() => setNumeroTren(t.numeroTren)}
              >
                {horaGtfs(t.salida)} · {t.numeroTren}
              </Text>
            ))}
          </View>
        </>
      )}

      <Text style={s.etiqueta}>Intervalo de sondeo</Text>
      <View style={s.chips}>
        {INTERVALOS_SONDEO_MIN.map((min) => (
          <Text
            key={min}
            style={[s.chip, intervalo === min && s.chipActivo]}
            onPress={() => setIntervalo(min)}
          >
            {min} min
          </Text>
        ))}
      </View>

      <Text style={s.etiqueta}>Bono</Text>
      <View style={s.chips}>
        {BONOS.map((b) => (
          <Text key={b} style={[s.chip, bono === b && s.chipActivo]} onPress={() => setBono(b)}>
            {etiquetaBono(b)}
          </Text>
        ))}
      </View>
      <Text style={{ fontSize: 12, color: paleta.textoSecundario }}>
        Guardamos tu perfil para personalizar los avisos. Renfe no publica las plazas por cupo de
        bono/abono: los avisos de disponibilidad se calculan sobre las tarifas generales.
      </Text>

      <Text style={s.etiqueta}>Notas (opcional)</Text>
      <TextInput
        style={[s.campo, s.notas]}
        placeholder="Ej. asiento junto a ventanilla..."
        placeholderTextColor={paleta.textoSecundario}
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

const estilos = (c: Paleta) =>
  StyleSheet.create({
    pantalla: {
      flex: 1,
      backgroundColor: c.fondo,
    },
    contenido: {
      padding: espaciado.lg,
      gap: espaciado.sm,
      paddingBottom: espaciado.xl * 2,
    },
    titulo: {
      fontSize: 24,
      fontWeight: '800',
      color: c.texto,
    },
    subtitulo: {
      fontSize: 14,
      color: c.textoSecundario,
      marginBottom: espaciado.sm,
    },
    etiqueta: {
      fontSize: 14,
      fontWeight: '600',
      color: c.texto,
      marginTop: espaciado.sm,
    },
    campo: {
      borderWidth: 1,
      borderColor: c.borde,
      borderRadius: radio.md,
      paddingHorizontal: espaciado.md,
      paddingVertical: 12,
      fontSize: 16,
      color: c.texto,
      backgroundColor: c.fondo,
    },
    notas: {
      minHeight: 88,
      textAlignVertical: 'top',
    },
    pista: {
      fontSize: 12,
      color: c.textoSecundario,
    },
    sugerencia: {
      fontSize: 14,
      color: c.primario,
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
      borderColor: c.borde,
      borderRadius: radio.completo,
      paddingHorizontal: 12,
      paddingVertical: 8,
      fontSize: 13,
      color: c.textoSecundario,
      backgroundColor: c.fondoSecundario,
      overflow: 'hidden',
    },
    chipActivo: {
      borderColor: c.primario,
      backgroundColor: c.acento,
      color: c.primarioOscuro,
      fontWeight: '700',
    },
  });
