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
  const [frecuencia, setFrecuencia] = useState<Frecuencia>('fecha');
  const [horaDesde, setHoraDesde] = useState('');
  const [horaHasta, setHoraHasta] = useState('');
  const [criterio, setCriterio] = useState<Criterio>('DISPONIBILIDAD');
  const [precioObjetivo, setPrecioObjetivo] = useState('');
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

  const hoyIso = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const fechaMin = hoyIso;
  // La fecha que viaja al servidor: un trayecto recurrente se ancla a hoy
  const fechaEfectiva = frecuencia === 'fecha' ? fecha : hoyIso;
  const recurrente = frecuencia !== 'fecha';

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
      criterio: Criterio;
      precioObjetivo: number | null;
      recurrente: boolean;
      soloLaborables: boolean;
      intervaloSondeoMin: number;
      bono: string;
      notas: string | null;
    }>(`/alertas/${editandoId}`)
      .then((a) => {
        setOrigen(a.origenNombre);
        setDestino(a.destinoNombre);
        setFecha(a.fechaViaje);
        setFrecuencia(frecuenciaDe(a.recurrente, a.soloLaborables));
        setHoraDesde(a.horaDesde ?? '');
        setHoraHasta(a.horaHasta ?? '');
        setIntervalo(a.intervaloSondeoMin);
        setBono(a.bono);
        setNotas(a.notas ?? '');
        setNumeroTren(a.numeroTren ?? '');
        setCriterio(a.criterio);
        setPrecioObjetivo(a.precioObjetivo != null ? String(a.precioObjetivo) : '');
      })
      .catch(() => Alert.alert('Error', 'No se pudo cargar la alerta'));
  }, [params, editandoId]);

  // Los3 próximos trenes de la ruta
  const timerTrenes = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const peticionTrenes = useRef(0);
  useEffect(() => {
    clearTimeout(timerTrenes.current);
    if (origen.trim().length < 2 || destino.trim().length < 2 || !fechaEfectiva) {
      setTrenesSugeridos([]);
      return;
    }
    timerTrenes.current = setTimeout(() => {
      const id = ++peticionTrenes.current;
      api<{ trenes: HorarioTrenResponse[] }>(
        `/trenes/horarios?origen=${encodeURIComponent(origen.trim())}&destino=${encodeURIComponent(destino.trim())}&fecha=${fechaEfectiva}`,
      )
        .then((d) => {
          if (peticionTrenes.current !== id) return;
          const horaAhora = new Intl.DateTimeFormat('es-ES', {
            timeZone: 'Europe/Madrid',
            hour: '2-digit',
            minute: '2-digit',
            hourCycle: 'h23',
          }).format(new Date());
          const futuros = d.trenes.filter((t) => {
            if (t.transbordo) return false;
            if (fechaEfectiva !== hoyIso) return true;
            return horaGtfs(t.salida) > horaAhora;
          });
          setTrenesSugeridos(futuros.slice(0, 3));
        })
        .catch(() => undefined);
    }, 400);
    return () => clearTimeout(timerTrenes.current);
  }, [origen, destino, fechaEfectiva, hoyIso]);

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
      // Un trayecto cotidiano se ancla a hoy: la fecha dejó de importar
      fechaViaje: fechaEfectiva,
      recurrente,
      soloLaborables: frecuencia === 'laborables',
      horaDesde: horaDesde.trim() || null,
      horaHasta: horaHasta.trim() || null,
      numeroTren: numeroTren.trim() || null,
      criterio,
      // Solo aplica con criterio PRECIO; en el resto lo mandamos a null
      precioObjetivo: criterio === 'PRECIO' ? Number(precioObjetivo) : null,
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
        {editandoId ? 'Modifica cualquier dato; reiniciaremos los avisos si cambia la ruta' : ''}
      </Text>

      <Text style={s.etiqueta}>Tipo de aviso</Text>
      <View style={s.chips}>
        {CRITERIOS.map(([valor, etiqueta]) => (
          <Text
            key={valor}
            style={[s.chip, criterio === valor && s.chipActivo]}
            onPress={() => setCriterio(valor)}
          >
            {etiqueta}
          </Text>
        ))}
      </View>
      <Text style={s.pista}>{DESCRIPCIONES[criterio]}</Text>

      {criterio === 'PRECIO' ? (
        <>
          <Text style={s.etiqueta}>Avisarme si baja de X €</Text>
          <TextInput
            style={s.campo}
            placeholder="Ej.: 30"
            placeholderTextColor={paleta.textoSecundario}
            keyboardType="decimal-pad"
            value={precioObjetivo}
            onChangeText={setPrecioObjetivo}
          />
        </>
      ) : null}

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

      <Text style={s.etiqueta}>¿Cuándo viajas?</Text>
      <View style={s.chips}>
        {FRECUENCIAS.map(([valor, etiqueta]) => (
          <Text
            key={valor}
            style={[s.chip, frecuencia === valor && s.chipActivo]}
            onPress={() => setFrecuencia(valor)}
          >
            {etiqueta}
          </Text>
        ))}
      </View>
      {recurrente ? (
        <Text style={s.pista}>
          Trayecto cotidiano: te avisaremos cada día
          {frecuencia === 'laborables' ? ', de lunes a viernes' : ''}. No hace falta indicar fecha.
        </Text>
      ) : null}

      {recurrente ? null : (
        <>
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
        </>
      )}

      <Text style={s.etiqueta}>Franja horaria (opcional)</Text>
      <View style={{ flexDirection: 'row', gap: espaciado.sm }}>
        <TextInput
          style={[s.campo, { flex: 1 }]}
          placeholder="Desde HH:MM"
          placeholderTextColor={paleta.textoSecundario}
          keyboardType="numbers-and-punctuation"
          maxLength={5}
          value={horaDesde}
          onChangeText={setHoraDesde}
        />
        <TextInput
          style={[s.campo, { flex: 1 }]}
          placeholder="Hasta HH:MM"
          placeholderTextColor={paleta.textoSecundario}
          keyboardType="numbers-and-punctuation"
          maxLength={5}
          value={horaHasta}
          onChangeText={setHoraHasta}
        />
      </View>
      <Text style={s.pista}>Solo avisaremos de salidas dentro de esa franja</Text>

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

const CRITERIOS = [
  ['DISPONIBILIDAD', 'Plazas libres'],
  ['RETRASO', 'Retraso'],
  ['HORARIO', 'Horario'],
  ['APERTURA_VENTA', 'Apertura de venta'],
  ['PRECIO', 'Precio'],
] as const;

type Criterio = (typeof CRITERIOS)[number][0];

const FRECUENCIAS = [
  ['fecha', 'Una fecha'],
  ['diaria', 'Cada día'],
  ['laborables', 'Lunes a viernes'],
] as const;

type Frecuencia = (typeof FRECUENCIAS)[number][0];

function frecuenciaDe(recurrente: boolean, soloLaborables: boolean): Frecuencia {
  if (!recurrente) return 'fecha';
  return soloLaborables ? 'laborables' : 'diaria';
}

const DESCRIPCIONES: Record<Criterio, string> = {
  DISPONIBILIDAD: 'Te avisaremos cuando haya plazas libres en este trayecto',
  RETRASO: 'Te avisaremos cuando tus trenes vayan con retraso (5+ min)',
  HORARIO: 'Te avisaremos si cambian los horarios programados',
  APERTURA_VENTA: 'Te avisaremos cuando se abra la venta de billetes',
  PRECIO: 'Te avisaremos si el precio baja de tu objetivo',
};

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
