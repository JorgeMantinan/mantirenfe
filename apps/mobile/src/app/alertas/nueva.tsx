import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, ScrollView, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import {
  DIAS_LABORABLES,
  type AlertaResponse,
  type HorarioTrenResponse,
} from '@mantirenfe/shared-types';
import { Boton } from '@/components/Boton';
import { CampoEstacion } from '@/components/alertas/CampoEstacion';
import { CampoFecha } from '@/components/alertas/CampoFecha';
import { CampoFranja } from '@/components/alertas/CampoFranja';
import { CampoNotas } from '@/components/alertas/CampoNotas';
import { CampoPrecio } from '@/components/alertas/CampoPrecio';
import { CampoTren } from '@/components/alertas/CampoTren';
import { CajaInterruptor } from '@/components/alertas/CajaInterruptor';
import { CajaVuelta } from '@/components/alertas/CajaVuelta';
import { ChipsBono } from '@/components/alertas/ChipsBono';
import { ChipsCriterio } from '@/components/alertas/ChipsCriterio';
import { ChipsFrecuencia } from '@/components/alertas/ChipsFrecuencia';
import { ChipsIntervalo } from '@/components/alertas/ChipsIntervalo';
import { ResumenAlerta } from '@/components/alertas/ResumenAlerta';
import { SelectorFechaNativa } from '@/components/alertas/SelectorFechaNativa';
import { estilosNueva } from '@/components/alertas/estilos';
import { useSugerenciasEstacion } from '@/hooks/useSugerenciasEstacion';
import { useTrenesSugeridos } from '@/hooks/useTrenesSugeridos';
import { api } from '@/lib/api';
import {
  MAX_CRITERIOS,
  construirAlertaVuelta,
  frecuenciaDe,
  prepararEnvio,
  resumenAlerta,
  type Criterio,
  type FormularioAlerta,
  type Frecuencia,
} from '@/lib/alertas';
import { useTema } from '@/lib/tema-contexto';
import { espaciado } from '@/lib/tema';

export default function NuevaAlerta() {
  const [origen, setOrigen] = useState('');
  const [destino, setDestino] = useState('');
  const [fecha, setFecha] = useState('');
  const [frecuencia, setFrecuencia] = useState<Frecuencia>('fecha');
  // Días marcados para "Días concretos" (preselección: lunes a viernes)
  const [dias, setDias] = useState<number[]>([...DIAS_LABORABLES]);
  const [horaDesde, setHoraDesde] = useState('');
  const [horaHasta, setHoraHasta] = useState('');
  // Criterios vigilados (multi-selección): nunca vacío y como mucho 4
  const [criterios, setCriterios] = useState<Criterio[]>(['DISPONIBILIDAD']);
  // Permitir 1 escala si no hay directo con plazas (solo con DISPONIBILIDAD)
  const [conexiones, setConexiones] = useState(false);
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
  const s = useMemo(() => estilosNueva(paleta), [paleta]);

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
    api<AlertaResponse>(`/alertas/${editandoId}`)
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
        // Multi-criterio: la lista manda; las alertas legadas traen `[criterio]`
        setCriterios(a.criterios?.length ? [...a.criterios] : [a.criterio]);
        setConexiones(a.conexiones === true);
        setPrecioObjetivo(a.precioObjetivo != null ? String(a.precioObjetivo) : '');
      })
      .catch(() => Alert.alert(t('comunes.error'), t('nueva.errorCargar')))
      .finally(() => setCargandoEdicion(false));
  }, [params, editandoId]);

  // Los3 próximos trenes de la ruta (debounce y cancelación en el hook)
  useTrenesSugeridos(origen, destino, fechaEfectiva, flexible, hoyIso, setTrenesSugeridos);

  // Sugerencias de estación: hook compartido con la pantalla de trenes
  const { sugOrigen, sugDestino, buscarSugerencias, limpiarSugerencias } = useSugerenciasEstacion();

  // Instantánea de todos los campos: la comparten el resumen y el envío, para
  // que lo que se cuenta y lo que se manda salgan siempre del mismo estado.
  const formulario: FormularioAlerta = {
    origen,
    destino,
    frecuencia,
    fecha,
    fechaEfectiva,
    dias,
    horaDesde,
    horaHasta,
    numeroTren,
    criterios,
    conexiones,
    precioObjetivo,
    intervalo,
    bono,
    notas,
    tambienVuelta,
    fechaVuelta,
    horaDesdeVuelta,
    horaHastaVuelta,
  };

  // Resumen de la alerta: se recalcula en cada render con los campos actuales,
  // para poder distinguir dos alertas de la misma ruta (tarjeta + aviso final).
  const resumen = resumenAlerta({ ...formulario, trenes: trenesSugeridos });

  /**
   * Alterna un criterio de la multi-selección: la lista nunca se queda vacía
   * (el último seleccionado no se desmarca) ni pasa del máximo permitido.
   */
  const alternarCriterio = (valor: Criterio) => {
    if (cargandoEdicion) return;
    if (criterios.includes(valor)) {
      if (criterios.length > 1) setCriterios(criterios.filter((c) => c !== valor));
      return;
    }
    if (criterios.length >= MAX_CRITERIOS) {
      Alert.alert(t('nueva.revisaCampos'), t('nueva.errorMaxCriterios'));
      return;
    }
    setCriterios([...criterios, valor]);
  };

  /** Marca/desmarca un día de «Días concretos» (la lista se mantiene ordenada). */
  const alternarDia = (dia: number) => {
    setDias((prev) =>
      prev.includes(dia) ? prev.filter((d) => d !== dia) : [...prev, dia].sort((a, b) => a - b),
    );
  };

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

  // Escribir en Origen/Destino cambia la ruta: el tren elegido ya no aplica
  const cambiarEstacion = (campo: 'origen' | 'destino', texto: string) => {
    if (campo === 'origen') setOrigen(texto);
    else setDestino(texto);
    buscarSugerencias(campo, texto);
    setNumeroTren('');
  };
  const elegirEstacion = (campo: 'origen' | 'destino', nombre: string) => {
    if (campo === 'origen') setOrigen(nombre);
    else setDestino(nombre);
    limpiarSugerencias();
  };

  const enviar = async () => {
    // Payload, días, criterios y vuelta, en el mismo orden que el formulario
    const preparado = prepararEnvio(formulario);
    if (!preparado.ok) {
      Alert.alert(t('nueva.revisaCampos'), preparado.mensaje);
      return;
    }

    setEnviando(true);
    try {
      const ida = await api<{ id?: string }>(editandoId ? `/alertas/${editandoId}` : '/alertas', {
        method: editandoId ? 'PATCH' : 'POST',
        json: preparado.datos,
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
                ...preparado.datos,
                fechaViaje: fechaVuelta || preparado.datos.fechaViaje,
                // Franja propia de la vuelta: vacía = la misma que la ida
                horaDesde: horaDesdeVuelta.trim() || preparado.datos.horaDesde,
                horaHasta: horaHastaVuelta.trim() || preparado.datos.horaHasta,
              }),
              grupoId: ida?.id,
            },
          });
          Alert.alert(
            t('nueva.creadasTitulo'),
            t('nueva.creadasCuerpo', { resumen: resumen.completo }),
            [{ text: t('nueva.entendido') }],
          );
        } catch {
          Alert.alert(t('comunes.error'), t('nueva.errorVuelta'), [{ text: t('nueva.entendido') }]);
        }
        router.back();
        return;
      }

      // «Crear vuelta»: misma ruta al revés (extremos invertidos)
      const urlCrearVuelta = `/alertas/nueva?origen=${encodeURIComponent(destino.trim())}&destino=${encodeURIComponent(origen.trim())}&fecha=${encodeURIComponent(fechaEfectiva)}`;

      Alert.alert(
        editandoId ? t('nueva.actualizadaTitulo') : t('nueva.creadaTitulo'),
        t(editandoId ? 'nueva.actualizadaCuerpo' : 'nueva.creadaCuerpo', {
          resumen: resumen.completo,
        }),
        editandoId
          ? undefined
          : [
              { text: t('nueva.ahoraNo'), style: 'cancel' },
              { text: t('nueva.crearVuelta'), onPress: () => router.push(urlCrearVuelta) },
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

      <ChipsCriterio
        criterios={criterios}
        cargandoEdicion={cargandoEdicion}
        onAlternar={alternarCriterio}
      />

      {criterios.includes('DISPONIBILIDAD') ? (
        <CajaInterruptor
          titulo={t('nueva.conexiones')}
          activo={conexiones}
          onToggle={setConexiones}
          deshabilitado={cargandoEdicion}
          pistas={[t('nueva.conexionesPista')]}
        />
      ) : null}

      {criterios.includes('PRECIO') ? (
        <CampoPrecio valor={precioObjetivo} onCambiar={setPrecioObjetivo} />
      ) : null}

      <CampoEstacion
        etiqueta={t('comunes.origen')}
        placeholder={t('nueva.placeholderOrigen')}
        valor={origen}
        sugerencias={sugOrigen}
        onCambiar={(texto) => cambiarEstacion('origen', texto)}
        onElegir={(nombre) => elegirEstacion('origen', nombre)}
      />

      <CampoEstacion
        etiqueta={t('comunes.destino')}
        placeholder={t('nueva.placeholderDestino')}
        valor={destino}
        sugerencias={sugDestino}
        onCambiar={(texto) => cambiarEstacion('destino', texto)}
        onElegir={(nombre) => elegirEstacion('destino', nombre)}
      />

      <ChipsFrecuencia
        frecuencia={frecuencia}
        dias={dias}
        onFrecuencia={setFrecuencia}
        onAlternarDia={alternarDia}
      />

      {frecuencia === 'fecha' ? (
        <CampoFecha
          valor={fecha}
          fechaMin={fechaMin}
          onCambiar={(v) => {
            setFecha(v);
            setNumeroTren(''); // el tren elegido es de otra fecha
          }}
          onAbrirSelector={() => setSelector('ida')}
        />
      ) : null}

      <CampoFranja
        horaDesde={horaDesde}
        horaHasta={horaHasta}
        onHoraDesde={setHoraDesde}
        onHoraHasta={setHoraHasta}
      />

      <CampoTren valor={numeroTren} trenes={trenesSugeridos} onCambiar={setNumeroTren} />

      <ChipsIntervalo intervalo={intervalo} onElegir={setIntervalo} />

      <ChipsBono bono={bono} onElegir={setBono} />

      <CampoNotas valor={notas} onCambiar={setNotas} />

      {editandoId ? null : (
        <CajaVuelta
          activo={tambienVuelta}
          onAlternar={alternarVuelta}
          fechaVuelta={fechaVuelta}
          onFechaVuelta={setFechaVuelta}
          horaDesdeVuelta={horaDesdeVuelta}
          onHoraDesdeVuelta={setHoraDesdeVuelta}
          horaHastaVuelta={horaHastaVuelta}
          onHoraHastaVuelta={setHoraHastaVuelta}
          fechaMin={fechaMin}
          onAbrirSelector={() => setSelector('vuelta')}
        />
      )}

      <ResumenAlerta origen={origen} destino={destino} resumen={resumen} />

      <Boton
        titulo={enviando ? t('nueva.creando') : t('nueva.crear')}
        onPress={() => void enviar()}
        cargando={enviando}
        style={{ marginTop: espaciado.sm }}
      />

      <SelectorFechaNativa
        campo={selector}
        valor={selector === 'ida' ? fecha : fechaVuelta}
        minimo={fechaMin}
        onCerrar={() => setSelector(null)}
        onElegir={(iso) => {
          if (selector === 'ida') {
            setFecha(iso);
            setNumeroTren(''); // el tren elegido es de otra fecha
          } else {
            setFechaVuelta(iso);
          }
        }}
      />
    </ScrollView>
  );
}
