import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { BONOS, INTERVALOS_SONDEO_MIN, type EstacionResponse } from '@mantirenfe/shared-types';
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

  const fechaMin = useMemo(() => new Date().toISOString().slice(0, 10), []);

  useEffect(() => {
    api<EstacionResponse[]>('/estaciones?limite=40')
      .then(setEstaciones)
      .catch(() => setEstaciones([]));
  }, []);

  const sugerencias = (texto: string) =>
    estaciones
      .filter((e) => e.nombre.toLowerCase().includes(texto.trim().toLowerCase()))
      .slice(0, 5);

  const enviar = async () => {
    const datos = {
      origenNombre: origen.trim(),
      destinoNombre: destino.trim(),
      fechaViaje: fecha,
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
      await api('/alertas', { method: 'POST', json: validacion.data });
      Alert.alert('Alerta creada', 'Empezamos a vigilar este trayecto.');
      router.back();
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'No se pudo crear la alerta');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <ScrollView style={estilos.pantalla} contentContainerStyle={estilos.contenido}>
      <Text style={estilos.titulo}>Nueva alerta</Text>
      <Text style={estilos.subtitulo}>
        Te avisaremos cuando cambie la disponibilidad de este trayecto
      </Text>

      <Text style={estilos.etiqueta}>Origen</Text>
      <TextInput
        style={estilos.campo}
        placeholder="Estación de origen"
        placeholderTextColor={colores.textoSecundario}
        value={origen}
        onChangeText={setOrigen}
      />
      {origen.trim().length >= 2 &&
        sugerencias(origen).map((e) => (
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
        onChangeText={setDestino}
      />
      {destino.trim().length >= 2 &&
        sugerencias(destino).map((e) => (
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
