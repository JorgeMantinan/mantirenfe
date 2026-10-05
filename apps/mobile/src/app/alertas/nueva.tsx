import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState, type ComponentType } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import {
  BONOS,
  DIAS_LABORABLES,
  INTERVALOS_SONDEO_MIN,
  horaGtfs,
  type HorarioTrenResponse,
} from '@mantirenfe/shared-types';
import { Boton } from '@/components/Boton';
import { Tarjeta } from '@/components/Tarjeta';
import { useSugerenciasEstacion } from '@/hooks/useSugerenciasEstacion';
import { locale } from '@/i18n';
import { api } from '@/lib/api';
import {
  construirAlertaVuelta,
  etiquetaBono,
  etiquetaDiasSemana,
  validarAlerta,
} from '@/lib/alertas';
import { fechaCorta } from '@/lib/proximoViaje';
import { useTema } from '@/lib/tema-contexto';
import { espaciado, radio, type Paleta } from '@/lib/tema';

type PropsSelectorFecha = {
  value: Date;
  mode?: 'date';
  display?: 'default' | 'spinner' | 'calendar';
  minimumDate?: Date;
  onChange: (evento: { type: string }, fecha?: Date) => void;
};

// El selector de fechas es un componente NATIVO: en APKs que aún no lo llevan
// compilado (updates OTA antiguos) el require lanza, lo capturamos y el campo
// sigue funcionando escribiendo a mano.
let SelectorFecha: ComponentType<PropsSelectorFecha> | null = null;
try {
  SelectorFecha = require('@react-native-community/datetimepicker').default;
} catch {
  SelectorFecha = null;
}

/** ISO con los datos LOCALES (toISOString pasaría a UTC y podría restar un día). */
function aIsoLocal(d: Date): string {
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mes}-${dia}`;
}

function fechaMedia(iso: string): Date {
  const [a, m, d] = iso.split('-').map(Number);
  return a && m && d ? new Date(a, m - 1, d, 12) : new Date();
}

/** Formato HH:MM de 24 h que acepta la API (mismo que el schema de la alerta). */
const RE_HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

export default function NuevaAlerta() {
  const [origen, setOrigen] = useState('');
  const [destino, setDestino] = useState('');
  const [fecha, setFecha] = useState('');
  const [frecuencia, setFrecuencia] = useState<Frecuencia>('fecha');
  // Días marcados para "Días concretos" (preselección: lunes a viernes)
  const [dias, setDias] = useState<number[]>([...DIAS_LABORABLES]);
  const [horaDesde, setHoraDesde] = useState('');
  const [horaHasta, setHoraHasta] = useState('');
  const [criterio, setCriterio] = useState<Criterio>('DISPONIBILIDAD');
  const [precioObjetivo, setPrecioObjetivo] = useState('');
  const [intervalo, setIntervalo] = useState(10);
  const [bono, setBono] = useState<string>('GENERAL');
  const [notas, setNotas] = useState('');
  const [tambienVuelta, setTambienVuelta] = useState(false);
  const [fechaVuelta, setFechaVuelta] = useState('');
  // Franja horaria propia de la vuelta: vacía = usar la de la ida
  const [horaDesdeVuelta, setHoraDesdeVuelta] = useState('');
  const [horaHastaVuelta, setHoraHastaVuelta] = useState('');
  /** 'ida' | 'vuelta': qué campo abrió el calendario nativo (null = cerrado). */
  const [selector, setSelector] = useState<'ida' | 'vuelta' | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [numeroTren, setNumeroTren] = useState('');
  const [trenesSugeridos, setTrenesSugeridos] = useState<HorarioTrenResponse[]>([]);
  const { paleta } = useTema();
  const { t } = useTranslation();
  const s = useMemo(() => estilos(paleta), [paleta]);

  const etiquetasCriterio: Record<Criterio, string> = {
    DISPONIBILIDAD: t('nueva.criterio.disponibilidad'),
    RETRASO: t('nueva.criterio.retraso'),
    HORARIO: t('nueva.criterio.horario'),
    APERTURA_VENTA: t('nueva.criterio.aperturaVenta'),
    PRECIO: t('nueva.criterio.precio'),
  };
  const descripcionesCriterio: Record<Criterio, string> = {
    DISPONIBILIDAD: t('nueva.desc.disponibilidad'),
    RETRASO: t('nueva.desc.retraso'),
    HORARIO: t('nueva.desc.horario'),
    APERTURA_VENTA: t('nueva.desc.aperturaVenta'),
    PRECIO: t('nueva.desc.precio'),
  };
  const etiquetasFrecuencia: Record<Frecuencia, string> = {
    fecha: t('nueva.frecuencia.fecha'),
    flexible: t('nueva.frecuencia.flexible'),
    diaria: t('nueva.frecuencia.diaria'),
    dias: t('nueva.frecuencia.dias'),
  };

  const params = useLocalSearchParams<{
    origen?: string;
    destino?: string;
    fecha?: string;
    numeroTren?: string;
    editar?: string;
  }>();
  const editandoId = typeof params.editar === 'string' && params.editar ? params.editar : undefined;
  // En modo edición el formulario arranca "vacío" (criterio DISPONIBILIDAD por
  // defecto): si la respuesta llega tarde y pisa la selección del usuario, el
  // criterio "vuelve a" estar en RETRASO. Se bloquea mientras carga y solo una vez.
  const [cargandoEdicion, setCargandoEdicion] = useState(false);
  const edicionCargada = useRef<string | null>(null);

  const hoyIso = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const fechaMin = hoyIso;
  // La fecha que viaja al servidor: cotidiano y "cualquier fecha" se anclan a hoy
  const recurrente = frecuencia === 'diaria' || frecuencia === 'dias';
  const flexible = frecuencia === 'flexible';
  const fechaEfectiva = frecuencia === 'fecha' ? fecha : hoyIso;

  // Precarga desde la búsqueda de trenes o carga completa en modo edición
  useEffect(() => {
    if (typeof params.origen === 'string' && params.origen) setOrigen(params.origen);
    if (typeof params.destino === 'string' && params.destino) setDestino(params.destino);
    if (typeof params.fecha === 'string' && params.fecha) setFecha(params.fecha);
    if (typeof params.numeroTren === 'string' && params.numeroTren)
      setNumeroTren(params.numeroTren);
    if (!editandoId) return;
    if (edicionCargada.current === editandoId) return;
    edicionCargada.current = editandoId;
    setCargandoEdicion(true);
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
      diasSemana: number[];
      fechaFlexible: boolean;
      intervaloSondeoMin: number;
      bono: string;
      notas: string | null;
    }>(`/alertas/${editandoId}`)
      .then((a) => {
        setOrigen(a.origenNombre);
        setDestino(a.destinoNombre);
        setFecha(a.fechaViaje);
        setFrecuencia(frecuenciaDe(a));
        setDias(a.diasSemana.length > 0 ? [...a.diasSemana] : [...DIAS_LABORABLES]);
        setHoraDesde(a.horaDesde ?? '');
        setHoraHasta(a.horaHasta ?? '');
        setIntervalo(a.intervaloSondeoMin);
        setBono(a.bono);
        setNotas(a.notas ?? '');
        setNumeroTren(a.numeroTren ?? '');
        setCriterio(a.criterio);
        setPrecioObjetivo(a.precioObjetivo != null ? String(a.precioObjetivo) : '');
      })
      .catch(() => Alert.alert(t('comunes.error'), t('nueva.errorCargar')))
      .finally(() => setCargandoEdicion(false));
  }, [params, editandoId]);

  // Los3 próximos trenes de la ruta
  const timerTrenes = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const peticionTrenes = useRef(0);
  useEffect(() => {
    clearTimeout(timerTrenes.current);
    // Con "cualquier fecha" no hay día del que sugerir salidas
    if (flexible || origen.trim().length < 2 || destino.trim().length < 2 || !fechaEfectiva) {
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
          const horaAhora = new Intl.DateTimeFormat(locale(), {
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
  }, [origen, destino, fechaEfectiva, hoyIso, flexible]);

  // Sugerencias de estación: hook compartido con la pantalla de trenes
  const { sugOrigen, sugDestino, buscarSugerencias, limpiarSugerencias } = useSugerenciasEstacion();

  // Resumen de la alerta: se recalcula en cada render con los campos actuales,
  // para poder distinguir dos alertas de la misma ruta (tarjeta + aviso final).
  const criterioEtiqueta = etiquetasCriterio[criterio];
  const resumenFecha = flexible
    ? t('nueva.resumenFlexible')
    : recurrente
      ? etiquetaDiasSemana(dias)
      : fecha.trim()
        ? fechaCorta(fecha.trim())
        : t('nueva.sinFecha');
  const resumenFranja =
    horaDesde.trim() || horaHasta.trim()
      ? `${horaDesde.trim() || '00:00'}–${horaHasta.trim() || '23:59'}`
      : null;
  const resumenCriterio = [
    criterioEtiqueta,
    criterio === 'PRECIO' && precioObjetivo.trim() ? `≤ ${precioObjetivo.trim()} €` : null,
    t('nueva.cadaMin', { min: intervalo }),
  ]
    .filter(Boolean)
    .join(' ');
  const resumen = [
    `${origen.trim() || '—'} → ${destino.trim() || '—'}`,
    resumenFecha,
    resumenFranja,
    resumenCriterio,
  ]
    .filter(Boolean)
    .join(' · ');
  const salidasResumen = trenesSugeridos.slice(0, 3).map((t) => horaGtfs(t.salida));

  /** Activa la vuelta con fecha por defecto (ida +2 días) y franja de la ida. */
  const alternarVuelta = (activo: boolean) => {
    setTambienVuelta(activo);
    if (activo) {
      if (!fechaVuelta) {
        const base = frecuencia === 'fecha' && fecha ? fecha : hoyIso;
        const d = new Date(`${base}T12:00:00Z`);
        d.setUTCDate(d.getUTCDate() + 2);
        setFechaVuelta(d.toISOString().slice(0, 10));
      }
      // La vuelta arranca con la franja de la ida (editable después)
      if (!horaDesdeVuelta) setHoraDesdeVuelta(horaDesde);
      if (!horaHastaVuelta) setHoraHastaVuelta(horaHasta);
    }
  };

  const enviar = async () => {
    if (frecuencia === 'dias' && dias.length === 0) {
      Alert.alert(t('nueva.revisaCampos'), t('nueva.errorDias'));
      return;
    }
    const datos = {
      origenNombre: origen.trim(),
      destinoNombre: destino.trim(),
      // Un trayecto cotidiano o "cualquier fecha" se ancla a hoy
      fechaViaje: fechaEfectiva,
      recurrente,
      // Único formato de días: vacío = todos los días
      diasSemana: recurrente ? [...dias].sort((a, b) => a - b) : [],
      // "Cualquier fecha en los próximos 6 meses": el worker rota el rango
      fechaFlexible: flexible,
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
      Alert.alert(
        t('nueva.revisaCampos'),
        validacion.error.issues[0]?.message ?? t('nueva.datosInvalidos'),
      );
      return;
    }
    if (tambienVuelta && !fechaVuelta) {
      Alert.alert(t('nueva.revisaCampos'), t('nueva.errorFechaVuelta'));
      return;
    }
    if (tambienVuelta && frecuencia === 'fecha' && fecha && fechaVuelta < fecha) {
      Alert.alert(t('nueva.revisaCampos'), t('nueva.errorFechaVueltaOrden'));
      return;
    }
    const desdeVuelta = horaDesdeVuelta.trim();
    const hastaVuelta = horaHastaVuelta.trim();
    if (tambienVuelta && (desdeVuelta || hastaVuelta)) {
      if (
        (desdeVuelta && !RE_HORA.test(desdeVuelta)) ||
        (hastaVuelta && !RE_HORA.test(hastaVuelta))
      ) {
        Alert.alert(t('nueva.revisaCampos'), t('nueva.errorFranjaVuelta'));
        return;
      }
      if (desdeVuelta && hastaVuelta && desdeVuelta > hastaVuelta) {
        Alert.alert(t('nueva.revisaCampos'), t('nueva.errorFranjaVueltaOrden'));
        return;
      }
    }

    setEnviando(true);
    try {
      const ida = await api<{ id?: string }>(editandoId ? `/alertas/${editandoId}` : '/alertas', {
        method: editandoId ? 'PATCH' : 'POST',
        json: validacion.data,
      });

      if (!editandoId && tambienVuelta) {
        // La ida ya está creada: la vuelta va como segunda petición con los
        // extremos invertidos y `grupoId` apuntando a la ida (para que el
        // listado las muestre juntas). Solo celebramos si salen las dos.
        try {
          await api('/alertas', {
            method: 'POST',
            json: {
              ...construirAlertaVuelta({
                ...validacion.data,
                fechaViaje: fechaVuelta || validacion.data.fechaViaje,
                // Franja propia de la vuelta: vacía = la misma que la ida
                horaDesde: horaDesdeVuelta.trim() || validacion.data.horaDesde,
                horaHasta: horaHastaVuelta.trim() || validacion.data.horaHasta,
              }),
              grupoId: ida?.id,
            },
          });
          Alert.alert(t('nueva.creadasTitulo'), t('nueva.creadasCuerpo', { resumen }), [
            { text: t('nueva.entendido') },
          ]);
        } catch {
          Alert.alert(t('comunes.error'), t('nueva.errorVuelta'), [{ text: t('nueva.entendido') }]);
        }
        router.back();
        return;
      }

      Alert.alert(
        editandoId ? t('nueva.actualizadaTitulo') : t('nueva.creadaTitulo'),
        t(editandoId ? 'nueva.actualizadaCuerpo' : 'nueva.creadaCuerpo', { resumen }),
        editandoId
          ? undefined
          : [
              { text: t('nueva.ahoraNo'), style: 'cancel' },
              {
                text: t('nueva.crearVuelta'),
                onPress: () =>
                  router.push(
                    `/alertas/nueva?origen=${encodeURIComponent(
                      destino.trim(),
                    )}&destino=${encodeURIComponent(origen.trim())}&fecha=${encodeURIComponent(
                      fechaEfectiva,
                    )}`,
                  ),
              },
            ],
      );
      router.back();
    } catch (e) {
      Alert.alert(t('comunes.error'), e instanceof Error ? e.message : t('nueva.errorGuardar'));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <ScrollView style={s.pantalla} contentContainerStyle={s.contenido}>
      <Text style={s.titulo}>{editandoId ? t('nueva.editarTitulo') : t('nueva.titulo')}</Text>
      <Text style={s.subtitulo}>{editandoId ? t('nueva.editarSubtitulo') : ''}</Text>

      <Text style={s.etiqueta}>{t('nueva.tipoAviso')}</Text>
      <View style={s.chips}>
        {CRITERIOS.map((valor) => (
          <Text
            key={valor}
            style={[
              s.chip,
              criterio === valor && s.chipActivo,
              cargandoEdicion && { opacity: 0.5 },
            ]}
            onPress={() => {
              if (!cargandoEdicion) setCriterio(valor);
            }}
          >
            {etiquetasCriterio[valor]}
          </Text>
        ))}
      </View>
      <Text style={s.pista}>{descripcionesCriterio[criterio]}</Text>

      {criterio === 'PRECIO' ? (
        <>
          <Text style={s.etiqueta}>{t('nueva.precioObjetivo')}</Text>
          <TextInput
            style={s.campo}
            placeholder={t('nueva.placeholderPrecio')}
            placeholderTextColor={paleta.textoSecundario}
            keyboardType="decimal-pad"
            value={precioObjetivo}
            onChangeText={setPrecioObjetivo}
          />
        </>
      ) : null}

      <Text style={s.etiqueta}>{t('comunes.origen')}</Text>
      <TextInput
        style={s.campo}
        placeholder={t('nueva.placeholderOrigen')}
        placeholderTextColor={paleta.textoSecundario}
        value={origen}
        onChangeText={(v) => {
          setOrigen(v);
          buscarSugerencias('origen', v);
          setNumeroTren(''); // la ruta cambió: el tren elegido ya no aplica
        }}
      />
      {origen.trim().length >= 2 &&
        sugOrigen.map((e) => (
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

      <Text style={s.etiqueta}>{t('comunes.destino')}</Text>
      <TextInput
        style={s.campo}
        placeholder={t('nueva.placeholderDestino')}
        placeholderTextColor={paleta.textoSecundario}
        value={destino}
        onChangeText={(v) => {
          setDestino(v);
          buscarSugerencias('destino', v);
          setNumeroTren('');
        }}
      />
      {destino.trim().length >= 2 &&
        sugDestino.map((e) => (
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

      <Text style={s.etiqueta}>{t('nueva.cuando')}</Text>
      <View style={s.chips}>
        {FRECUENCIAS.map((valor) => (
          <Text
            key={valor}
            style={[s.chip, frecuencia === valor && s.chipActivo]}
            onPress={() => setFrecuencia(valor)}
          >
            {etiquetasFrecuencia[valor]}
          </Text>
        ))}
      </View>
      {frecuencia === 'diaria' ? <Text style={s.pista}>{t('nueva.cotidianoDiaria')}</Text> : null}
      {flexible ? <Text style={s.pista}>{t('nueva.pistaFlexible')}</Text> : null}
      {frecuencia === 'dias' ? (
        <>
          <View style={s.chips}>
            {t('comunes.diasIniciales')
              .split(',')
              .map((letra, dia) => (
                <Text
                  key={dia}
                  style={[s.chip, dias.includes(dia) && s.chipActivo]}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: dias.includes(dia) }}
                  onPress={() =>
                    setDias((prev) =>
                      prev.includes(dia)
                        ? prev.filter((d) => d !== dia)
                        : [...prev, dia].sort((a, b) => a - b),
                    )
                  }
                >
                  {letra}
                </Text>
              ))}
          </View>
          <Text style={s.pista}>{t('nueva.pistaDias')}</Text>
        </>
      ) : null}

      {frecuencia === 'fecha' ? (
        <>
          <Text style={s.etiqueta}>{t('nueva.fechaViaje')}</Text>
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
          <Text style={s.pista}>{t('nueva.minimo', { fecha: fechaMin })}</Text>
          {SelectorFecha ? (
            <Pressable
              onPress={() => setSelector('ida')}
              style={{ alignSelf: 'flex-start' }}
              accessibilityRole="button"
            >
              <Text style={{ color: paleta.primario, fontWeight: '600' }}>
                {t('nueva.elegirFecha')}
              </Text>
            </Pressable>
          ) : null}
        </>
      ) : null}

      <Text style={s.etiqueta}>{t('nueva.franja')}</Text>
      <View style={{ flexDirection: 'row', gap: espaciado.sm }}>
        <TextInput
          style={[s.campo, { flex: 1 }]}
          placeholder={t('nueva.desdeHora')}
          placeholderTextColor={paleta.textoSecundario}
          keyboardType="numbers-and-punctuation"
          maxLength={5}
          value={horaDesde}
          onChangeText={setHoraDesde}
        />
        <TextInput
          style={[s.campo, { flex: 1 }]}
          placeholder={t('nueva.hastaHora')}
          placeholderTextColor={paleta.textoSecundario}
          keyboardType="numbers-and-punctuation"
          maxLength={5}
          value={horaHasta}
          onChangeText={setHoraHasta}
        />
      </View>
      <Text style={s.pista}>{t('nueva.soloFranja')}</Text>

      <Text style={s.etiqueta}>{t('nueva.trenConcreto')}</Text>
      <TextInput
        style={s.campo}
        placeholder={t('nueva.placeholderTren')}
        placeholderTextColor={paleta.textoSecundario}
        value={numeroTren}
        onChangeText={setNumeroTren}
        autoCapitalize="characters"
      />
      {trenesSugeridos.length > 0 && !numeroTren.trim() && (
        <>
          <Text style={s.pista}>{t('nueva.proximosTrenes')}</Text>
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

      <Text style={s.etiqueta}>{t('nueva.intervalo')}</Text>
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

      <Text style={s.etiqueta}>{t('nueva.bono')}</Text>
      <View style={s.chips}>
        {BONOS.map((b) => (
          <Text key={b} style={[s.chip, bono === b && s.chipActivo]} onPress={() => setBono(b)}>
            {etiquetaBono(b)}
          </Text>
        ))}
      </View>
      <Text style={{ fontSize: 12, color: paleta.textoSecundario }}>{t('nueva.avisoBono')}</Text>

      <Text style={s.etiqueta}>{t('nueva.notas')}</Text>
      <TextInput
        style={[s.campo, s.notas]}
        placeholder={t('nueva.placeholderNotas')}
        placeholderTextColor={paleta.textoSecundario}
        multiline
        value={notas}
        onChangeText={setNotas}
      />

      {editandoId ? null : (
        <View style={s.cajaVuelta}>
          <View style={s.cajaVueltaFila}>
            <Text
              style={s.cajaVueltaTitulo}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: tambienVuelta }}
              onPress={() => alternarVuelta(!tambienVuelta)}
            >
              {t('nueva.tambienVuelta')}
            </Text>
            <Switch
              value={tambienVuelta}
              onValueChange={alternarVuelta}
              trackColor={{ true: paleta.primarioClaro, false: paleta.borde }}
              thumbColor="#fff"
            />
          </View>
          <Text style={s.pista}>{t('nueva.tambienVueltaDesc')}</Text>
          <Text style={s.pista}>{t('nueva.tambienVueltaRiesgo')}</Text>
          {tambienVuelta ? (
            <>
              <Text style={s.etiqueta}>{t('nueva.fechaVuelta')}</Text>
              <TextInput
                style={s.campo}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={paleta.textoSecundario}
                keyboardType="numbers-and-punctuation"
                value={fechaVuelta}
                onChangeText={setFechaVuelta}
              />
              <Text style={s.pista}>{t('nueva.minimo', { fecha: fechaMin })}</Text>
              {SelectorFecha ? (
                <Pressable
                  onPress={() => setSelector('vuelta')}
                  style={{ alignSelf: 'flex-start' }}
                  accessibilityRole="button"
                >
                  <Text style={{ color: paleta.primario, fontWeight: '600' }}>
                    {t('nueva.elegirFecha')}
                  </Text>
                </Pressable>
              ) : null}
              <Text style={s.etiqueta}>{t('nueva.horaDesdeVueltaLabel')}</Text>
              <TextInput
                style={s.campo}
                placeholder={t('nueva.desdeHora')}
                placeholderTextColor={paleta.textoSecundario}
                keyboardType="numbers-and-punctuation"
                maxLength={5}
                value={horaDesdeVuelta}
                onChangeText={setHoraDesdeVuelta}
              />
              <Text style={s.etiqueta}>{t('nueva.horaHastaVueltaLabel')}</Text>
              <TextInput
                style={s.campo}
                placeholder={t('nueva.hastaHora')}
                placeholderTextColor={paleta.textoSecundario}
                keyboardType="numbers-and-punctuation"
                maxLength={5}
                value={horaHastaVuelta}
                onChangeText={setHoraHastaVuelta}
              />
              <Text style={s.pista}>{t('nueva.pistaFranjaVuelta')}</Text>
            </>
          ) : null}
        </View>
      )}

      <Tarjeta style={{ marginTop: espaciado.sm }}>
        <Text style={s.resumenTitulo}>{t('nueva.resumenTitulo')}</Text>
        <Text style={s.resumenRuta}>
          {origen.trim() || '—'} <Text style={{ color: paleta.primario }}>→</Text>{' '}
          {destino.trim() || '—'}
        </Text>
        <Text style={s.pista}>
          {[resumenFecha, resumenFranja, resumenCriterio].filter(Boolean).join(' · ')}
        </Text>
        {salidasResumen.length > 0 ? (
          <Text style={s.pista}>
            {t('nueva.proximasSalidas', { salidas: salidasResumen.join(', ') })}
          </Text>
        ) : null}
      </Tarjeta>

      <Boton
        titulo={enviando ? t('nueva.creando') : t('nueva.crear')}
        onPress={() => void enviar()}
        cargando={enviando}
        style={{ marginTop: espaciado.sm }}
      />
      {SelectorFecha && selector ? (
        <SelectorFecha
          value={fechaMedia(selector === 'ida' ? fecha : fechaVuelta)}
          mode="date"
          display="default"
          minimumDate={fechaMedia(fechaMin)}
          onChange={(evento, d) => {
            setSelector(null);
            if (evento.type === 'set' && d) {
              const iso = aIsoLocal(d);
              if (selector === 'ida') {
                setFecha(iso);
                setNumeroTren(''); // el tren elegido es de otra fecha
              } else {
                setFechaVuelta(iso);
              }
            }
          }}
        />
      ) : null}
    </ScrollView>
  );
}

const CRITERIOS = ['DISPONIBILIDAD', 'RETRASO', 'HORARIO', 'APERTURA_VENTA', 'PRECIO'] as const;

type Criterio = (typeof CRITERIOS)[number];

const FRECUENCIAS = ['fecha', 'flexible', 'diaria', 'dias'] as const;

type Frecuencia = (typeof FRECUENCIAS)[number];

/** Modalidad a partir de lo que hay guardado en la alerta (modo edición). */
function frecuenciaDe(alerta: {
  recurrente: boolean;
  diasSemana: number[];
  fechaFlexible: boolean;
}): Frecuencia {
  if (alerta.fechaFlexible) return 'flexible';
  if (!alerta.recurrente) return 'fecha';
  return alerta.diasSemana.length > 0 ? 'dias' : 'diaria';
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
    cajaVuelta: {
      borderWidth: 1,
      borderColor: c.borde,
      borderRadius: radio.md,
      backgroundColor: c.fondoSecundario,
      padding: espaciado.md,
      gap: 6,
      marginTop: espaciado.sm,
    },
    cajaVueltaFila: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: espaciado.sm,
    },
    cajaVueltaTitulo: {
      flex: 1,
      fontSize: 14,
      fontWeight: '600',
      color: c.texto,
    },
    pista: {
      fontSize: 12,
      color: c.textoSecundario,
    },
    resumenTitulo: {
      fontSize: 12,
      fontWeight: '700',
      color: c.primario,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    resumenRuta: {
      fontSize: 15,
      fontWeight: '700',
      color: c.texto,
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
