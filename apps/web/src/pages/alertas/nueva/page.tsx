import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, BellRing } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { useBuscadorEstaciones } from '@/hooks/useBuscadorEstaciones';
import { construirAlertaVuelta, etiquetaDiasSemana } from '@/lib/alertas';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { SELECT_CLS } from '@/lib/ui-constants';
import { fechaCorta } from '@/lib/proximoViaje';
import { BONOS, DIAS_LABORABLES, INTERVALOS_SONDEO_MIN } from '@mantirenfe/shared-types';
import type { TFunction } from 'i18next';
import {
  horaGtfs,
  type AlertaResponse,
  type CriterioAlerta,
  type HorarioTrenResponse,
} from '@mantirenfe/shared-types';

/** Modalidades del bloque "¿Cuándo viajas?": fecha concreta, rango flexible o cotidiano. */
type Frecuencia = 'fecha' | 'flexible' | 'diaria' | 'dias';

/** Formato HH:MM de 24 h que acepta la API (mismo que el schema de la alerta). */
const RE_HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Etiquetas del bono de la alerta, en el idioma activo. */
function etiquetasBonos(t: TFunction): Record<string, string> {
  return {
    GENERAL: t('nuevaAlerta.bonoGeneral'),
    BONO_10: t('nuevaAlerta.bonoBono10'),
    BONO_20: t('nuevaAlerta.bonoBono20'),
    JUVENIL: t('nuevaAlerta.bonoJuvenil'),
    ESTUDIANTE: t('nuevaAlerta.bonoEstudiante'),
    DISCAPACIDAD: t('nuevaAlerta.bonoDiscapacidad'),
    FAMILIA_NUMEROSA: t('nuevaAlerta.bonoFamilia'),
    MAYOR_60: t('nuevaAlerta.bonoMayor60'),
    OTRO: t('nuevaAlerta.bonoOtro'),
  };
}

/** Etiquetas cortas del criterio para el resumen (los chips usan textos más largos). */
function etiquetasCriterio(t: TFunction): Record<string, string> {
  return {
    DISPONIBILIDAD: t('nuevaAlerta.criterioPlazas'),
    RETRASO: t('nuevaAlerta.criterioRetraso'),
    HORARIO: t('nuevaAlerta.criterioHorarioCorto'),
    APERTURA_VENTA: t('nuevaAlerta.criterioVentaCorta'),
    PRECIO: t('nuevaAlerta.criterioPrecioCorto'),
  };
}

/** Etiquetas largas de los chips de criterio (los textos del antiguo select). */
function etiquetasCriterioLargas(t: TFunction): Record<CriterioAlerta, string> {
  return {
    DISPONIBILIDAD: t('nuevaAlerta.criterioDisponibilidad'),
    HORARIO: t('nuevaAlerta.criterioHorario'),
    RETRASO: t('nuevaAlerta.criterioRetrasoTren'),
    APERTURA_VENTA: t('nuevaAlerta.criterioVenta'),
    PRECIO: t('nuevaAlerta.criterioPrecio'),
  };
}

/** Orden de los chips de criterio (multi-selección). */
const CRITERIOS: readonly CriterioAlerta[] = [
  'DISPONIBILIDAD',
  'HORARIO',
  'RETRASO',
  'APERTURA_VENTA',
  'PRECIO',
];

/** Máximo de criterios vigilados a la vez (lo marca el schema compartido). */
const MAX_CRITERIOS = 4;

function frecuencias(t: TFunction): Array<{ valor: Frecuencia; etiqueta: string }> {
  return [
    { valor: 'fecha', etiqueta: t('nuevaAlerta.frecuenciaFecha') },
    { valor: 'flexible', etiqueta: t('nuevaAlerta.frecuenciaFlexible') },
    { valor: 'diaria', etiqueta: t('nuevaAlerta.frecuenciaDiaria') },
    { valor: 'dias', etiqueta: t('nuevaAlerta.frecuenciaDias') },
  ];
}

/** Modalidad a partir de lo que hay guardado en la alerta (modo edición). */
function frecuenciaDe(alerta: AlertaResponse): Frecuencia {
  if (alerta.fechaFlexible) return 'flexible';
  if (!alerta.recurrente) return 'fecha';
  return alerta.diasSemana.length > 0 ? 'dias' : 'diaria';
}

/** Letras de los chips de días, en orden 0 = domingo … 6 = sábado. */
function letrasDias(t: TFunction): string[] {
  return t('comunes.diasIniciales').split(',');
}

/**
 * Deja solo las salidas que aún no han salido (si no es el día de hoy no se
 * toca nada) y se queda con las 3 próximas, para pintar los chips.
 */
function salidasFuturas(
  lista: HorarioTrenResponse[],
  fechaEfectiva: string,
  hoyIso: string,
): HorarioTrenResponse[] {
  const horaAhora = new Intl.DateTimeFormat('es-ES', {
    timeZone: 'Europe/Madrid',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date());
  const futuros = lista.filter((t) => {
    if (t.transbordo) return false;
    if (fechaEfectiva !== hoyIso) return true;
    return horaGtfs(t.salida) > horaAhora;
  });
  return futuros.slice(0, 3);
}

export function PaginaNuevaAlerta() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const editandoId = params.get('editar');
  const [origen, setOrigen] = useState('');
  const [destino, setDestino] = useState('');
  const [fecha, setFecha] = useState('');
  const [frecuencia, setFrecuencia] = useState<Frecuencia>('fecha');
  // Días marcados para "Días concretos" (preselección: lunes a viernes)
  const [dias, setDias] = useState<number[]>([...DIAS_LABORABLES]);
  const [horaDesde, setHoraDesde] = useState('');
  const [horaHasta, setHoraHasta] = useState('');
  // Criterios vigilados (multi-selección): nunca vacío y como mucho 4
  const [criterios, setCriterios] = useState<CriterioAlerta[]>(['DISPONIBILIDAD']);
  const [precioObjetivo, setPrecioObjetivo] = useState('');
  const [intervalo, setIntervalo] = useState(10);
  const [bono, setBono] = useState('GENERAL');
  const [numeroTren, setNumeroTren] = useState('');
  const [notas, setNotas] = useState('');
  const [tambienVuelta, setTambienVuelta] = useState(false);
  const [fechaVuelta, setFechaVuelta] = useState('');
  // Franja horaria propia de la vuelta: vacía = usar la de la ida
  const [horaDesdeVuelta, setHoraDesdeVuelta] = useState('');
  const [horaHastaVuelta, setHoraHastaVuelta] = useState('');
  const [enviando, setEnviando] = useState(false);
  // Mientras carga la alerta en modo edición el formulario viene "vacío" (criterio
  // DISPONIBILIDAD por defecto); si el usuario toca el selector antes de que llegue
  // la respuesta, aplicar la carga lo pisaría. Se bloquea y solo se carga una vez.
  const [cargandoEdicion, setCargandoEdicion] = useState(false);
  const edicionCargada = useRef<string | null>(null);
  const [trenesSugeridos, setTrenesSugeridos] = useState<HorarioTrenResponse[]>([]);

  const hoyIso = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const fechaMin = hoyIso;
  // La fecha que viaja al servidor: cotidiano y "cualquier fecha" se anclan a hoy
  const recurrente = frecuencia === 'diaria' || frecuencia === 'dias';
  const flexible = frecuencia === 'flexible';
  const fechaEfectiva = frecuencia === 'fecha' ? fecha : hoyIso;

  // Búsqueda de estaciones mientras se escribe (con debounce): la lista inicial
  // solo traía las primeras40 alfabéticas y nunca aparecían, p.ej., las de Vigo.
  // Una lista por campo (mismo patrón que la página de trenes): así escribir en
  // Destino no deja a la vista las sugerencias de Origen ni viceversa.
  const busOrigen = useBuscadorEstaciones({ limite: 10 });
  const busDestino = useBuscadorEstaciones({ limite: 10 });
  const { sugerencias: sugOrigen } = busOrigen;
  const { sugerencias: sugDestino } = busDestino;

  // Cierra los dos desplegables y cancela sus peticiones pendientes: escribir
  // en un campo (o elegir una opción) no debe dejar a la vista la lista del otro.
  const limpiarSugerencias = (conservar?: 'origen' | 'destino') => {
    if (conservar !== 'origen') busOrigen.limpiar();
    if (conservar !== 'destino') busDestino.limpiar();
  };

  const sugerir = (campo: 'origen' | 'destino', texto: string) => {
    limpiarSugerencias(campo);
    (campo === 'origen' ? busOrigen : busDestino).sugerir(texto);
  };

  /**
   * Alterna un criterio de la multi-selección. La lista nunca se queda vacía
   * (el último seleccionado no se desmarca) ni pasa del máximo permitido.
   */
  const alternarCriterio = (valor: CriterioAlerta) => {
    if (cargandoEdicion) return;
    if (criterios.includes(valor)) {
      if (criterios.length > 1) setCriterios(criterios.filter((c) => c !== valor));
      return;
    }
    if (criterios.length >= MAX_CRITERIOS) {
      toast.error(t('nuevaAlerta.errorMaxCriterios'));
      return;
    }
    setCriterios([...criterios, valor]);
  };

  // Precarga desde la búsqueda de trenes (?origen=&destino=&fecha=&numeroTren=)
  // o carga completa al modo edición (?editar=<id>)
  useEffect(() => {
    const origenParam = params.get('origen');
    const destinoParam = params.get('destino');
    const fechaParam = params.get('fecha');
    const trenParam = params.get('numeroTren');
    if (origenParam) setOrigen(origenParam);
    if (destinoParam) setDestino(destinoParam);
    if (fechaParam) setFecha(fechaParam);
    if (trenParam) setNumeroTren(trenParam);

    if (editandoId && edicionCargada.current !== editandoId) {
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
          // Multi-criterio: la lista manda; las alertas legadas traen `[criterio]`
          setCriterios(a.criterios?.length ? [...a.criterios] : [a.criterio]);
          setPrecioObjetivo(a.precioObjetivo != null ? String(a.precioObjetivo) : '');
          setIntervalo(a.intervaloSondeoMin);
          setBono(a.bono);
          setNotas(a.notas ?? '');
          setNumeroTren(a.numeroTren ?? '');
        })
        .catch(() => toast.error(t('nuevaAlerta.errorCargar')))
        .finally(() => setCargandoEdicion(false));
    }
  }, [params, editandoId]);

  // Los 3 próximos trenes de la ruta (para elegir sin escribir el número).
  // Debounce amplio (800 ms) y mínimo 4 caracteres por campo: mientras el
  // usuario sigue escribiendo no se dispara ninguna petición.
  const cacheHorarios = useRef(new Map<string, HorarioTrenResponse[]>());
  useEffect(() => {
    // Con "cualquier fecha" no hay día del que sugerir salidas
    if (flexible || origen.trim().length < 4 || destino.trim().length < 4 || !fechaEfectiva) {
      setTrenesSugeridos([]);
      return;
    }
    const clave = `${origen.trim()}|${destino.trim()}|${fechaEfectiva}`;
    const enCache = cacheHorarios.current.get(clave);
    if (enCache) {
      // Ya pedimos esta combinación: ni debounce ni petición
      setTrenesSugeridos(salidasFuturas(enCache, fechaEfectiva, hoyIso));
      return;
    }
    const controlador = new AbortController();
    const timer = window.setTimeout(() => {
      api<{ trenes: HorarioTrenResponse[] }>(
        `/trenes/horarios?origen=${encodeURIComponent(origen.trim())}&destino=${encodeURIComponent(destino.trim())}&fecha=${fechaEfectiva}`,
        { signal: controlador.signal },
      )
        .then((d) => {
          cacheHorarios.current.set(clave, d.trenes);
          // Caché acotada: como mucho 50 combinaciones por sesión
          if (cacheHorarios.current.size > 50) {
            const primera = cacheHorarios.current.keys().next().value;
            if (primera !== undefined) cacheHorarios.current.delete(primera);
          }
          setTrenesSugeridos(salidasFuturas(d.trenes, fechaEfectiva, hoyIso));
        })
        .catch(() => undefined);
    }, 800);
    return () => {
      window.clearTimeout(timer);
      controlador.abort();
    };
  }, [origen, destino, fechaEfectiva, hoyIso, flexible]);

  // Etiquetas i18n: se recalculan solo cuando cambia el idioma
  const etiquetasBono = useMemo(() => etiquetasBonos(t), [t]);
  const criteriosCortos = useMemo(() => etiquetasCriterio(t), [t]);
  const criteriosLargos = useMemo(() => etiquetasCriterioLargas(t), [t]);
  const listaFrecuencias = useMemo(() => frecuencias(t), [t]);
  const inicialesDias = useMemo(() => letrasDias(t), [t]);

  // Resumen de la alerta: se recalcula en cada render con los campos actuales,
  // para poder distinguir dos alertas de la misma ruta (caja + toast final).
  const criterioEtiqueta = criterios.map((c) => criteriosCortos[c] ?? c).join(', ');
  const resumenFecha = flexible
    ? t('nuevaAlerta.resumenFlexible')
    : recurrente
      ? etiquetaDiasSemana(t, dias)
      : fecha
        ? fechaCorta(fecha)
        : t('nuevaAlerta.resumenSinFecha');
  const resumenFranja =
    horaDesde || horaHasta ? `${horaDesde || '00:00'}–${horaHasta || '23:59'}` : null;
  const resumenCriterio = [
    criterioEtiqueta,
    criterios.includes('PRECIO') && precioObjetivo ? `≤ ${precioObjetivo} €` : null,
    t('alertas.cadaMin', { min: intervalo }),
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

  const enviar = async (event: FormEvent) => {
    event.preventDefault();
    if (origen.trim().length < 2 || destino.trim().length < 2) {
      toast.error(t('nuevaAlerta.errorOrigenDestino'));
      return;
    }
    if (frecuencia === 'fecha' && !fecha) {
      toast.error(t('nuevaAlerta.errorFecha'));
      return;
    }
    if (frecuencia === 'dias' && dias.length === 0) {
      toast.error(t('nuevaAlerta.errorDias'));
      return;
    }
    if (tambienVuelta && !fechaVuelta) {
      toast.error(t('nuevaAlerta.errorFechaVuelta'));
      return;
    }
    if (tambienVuelta && frecuencia === 'fecha' && fecha && fechaVuelta < fecha) {
      toast.error(t('nuevaAlerta.errorFechaVueltaOrden'));
      return;
    }
    const desdeVuelta = horaDesdeVuelta.trim();
    const hastaVuelta = horaHastaVuelta.trim();
    if (tambienVuelta && (desdeVuelta || hastaVuelta)) {
      if (
        (desdeVuelta && !RE_HORA.test(desdeVuelta)) ||
        (hastaVuelta && !RE_HORA.test(hastaVuelta))
      ) {
        toast.error(t('nuevaAlerta.errorFranjaVuelta'));
        return;
      }
      if (desdeVuelta && hastaVuelta && desdeVuelta > hastaVuelta) {
        toast.error(t('nuevaAlerta.errorFranjaVueltaOrden'));
        return;
      }
    }
    const objetivo = Number(precioObjetivo);
    if (criterios.length === 0) {
      toast.error(t('nuevaAlerta.errorSinCriterio'));
      return;
    }
    if (criterios.length > MAX_CRITERIOS) {
      toast.error(t('nuevaAlerta.errorMaxCriterios'));
      return;
    }
    if (criterios.includes('PRECIO') && !(Number.isFinite(objetivo) && objetivo > 0)) {
      toast.error(t('nuevaAlerta.errorPrecio'));
      return;
    }

    setEnviando(true);
    try {
      const url = editandoId ? `/alertas/${editandoId}` : '/alertas';
      const metodo = editandoId ? 'PATCH' : 'POST';
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
        horaDesde: horaDesde || null,
        horaHasta: horaHasta || null,
        numeroTren: numeroTren.trim() || null,
        // Multi-criterio: la lista es la que vigila la alerta; `criterio` sigue
        // viajando como el primero de la lista (compatibilidad con la API vieja)
        criterio: criterios[0] ?? 'DISPONIBILIDAD',
        criterios,
        // Solo aplica si se vigilan precios; en el resto lo mandamos a null
        precioObjetivo: criterios.includes('PRECIO') ? objetivo : null,
        intervaloSondeoMin: intervalo,
        bono,
        notas: notas.trim() || null,
      };
      // Formulario de la vuelta precargado (extremos invertidos): lo usan la
      // acción del toast y el aviso de fallo para poder reintentarla.
      const rutaVuelta = `/alertas/nueva?origen=${encodeURIComponent(
        datos.destinoNombre,
      )}&destino=${encodeURIComponent(datos.origenNombre)}&fecha=${encodeURIComponent(
        fechaVuelta || fechaEfectiva,
      )}`;
      const resultado = await api<{ id?: string; error?: unknown }>(url, {
        method: metodo,
        json: datos,
      });

      if (resultado?.error) {
        toast.error(t('nuevaAlerta.errorCampos'));
        return;
      }

      if (editandoId) {
        toast.success(t('nuevaAlerta.toastActualizada', { resumen }));
      } else if (tambienVuelta) {
        // La ida ya está creada: la vuelta va como segunda petición con la
        // misma alerta y los extremos invertidos. Si falla, no celebramos:
        // avisamos de forma diferenciada y dejamos el reintento a un clic.
        let vueltaCreada = false;
        try {
          const vuelta = await api<{ id?: string; error?: unknown }>('/alertas', {
            method: 'POST',
            json: {
              ...construirAlertaVuelta({
                ...datos,
                fechaViaje: fechaVuelta || datos.fechaViaje,
                // Franja propia de la vuelta: vacía = la misma que la ida
                horaDesde: horaDesdeVuelta.trim() || datos.horaDesde,
                horaHasta: horaHastaVuelta.trim() || datos.horaHasta,
              }),
              // La vuelta apunta a la ida para que el listado las muestre juntas
              grupoId: resultado.id,
            },
          });
          vueltaCreada = !vuelta?.error;
        } catch {
          vueltaCreada = false;
        }
        if (vueltaCreada) {
          toast.success(t('nuevaAlerta.toastCreadasVuelta', { resumen }), { duration: 8000 });
        } else {
          toast.error(t('nuevaAlerta.errorVuelta'), {
            duration: 10000,
            action: {
              label: t('nuevaAlerta.accionVuelta'),
              onClick: () => navigate(rutaVuelta),
            },
          });
        }
      } else {
        toast.success(t('nuevaAlerta.toastCreada', { resumen }), {
          duration: 8000,
          action: {
            label: t('nuevaAlerta.accionVuelta'),
            onClick: () => navigate(rutaVuelta),
          },
        });
      }
      navigate('/alertas');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('nuevaAlerta.errorGuardar'));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6 animate-fade-in">
      <div className="space-y-1">
        <Button variant="ghost" size="sm" onClick={() => navigate('/alertas')} className="-ml-2">
          <ArrowLeft aria-hidden="true" /> {t('nuevaAlerta.volver')}
        </Button>
        <h1 className="font-heading text-3xl font-bold tracking-tight">
          {editandoId ? t('nuevaAlerta.editarTitulo') : t('nuevaAlerta.nuevaTitulo')}
        </h1>
        <p className="text-muted-foreground">
          {editandoId ? t('nuevaAlerta.editarSub') : t('nuevaAlerta.nuevaSub')}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl">
            <BellRing className="h-5 w-5 text-primary" aria-hidden="true" />
            {t('nuevaAlerta.trayectoTitulo')}
          </CardTitle>
          <CardDescription>{t('nuevaAlerta.trayectoDesc')}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={enviar} className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="origen">{t('trayectos.etiquetaOrigen')}</Label>
                <Input
                  id="origen"
                  list="estaciones-origen"
                  value={origen}
                  onChange={(e) => {
                    setOrigen(e.target.value);
                    sugerir('origen', e.target.value);
                    setNumeroTren(''); // la ruta cambió: el tren elegido ya no aplica
                  }}
                  placeholder="Madrid-Atocha"
                  required
                  minLength={2}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="destino">{t('trayectos.etiquetaDestino')}</Label>
                <Input
                  id="destino"
                  list="estaciones-destino"
                  value={destino}
                  onChange={(e) => {
                    setDestino(e.target.value);
                    sugerir('destino', e.target.value);
                    setNumeroTren('');
                  }}
                  placeholder="Barcelona-Sants"
                  required
                  minLength={2}
                />
              </div>
            </div>
            <datalist id="estaciones-origen">
              {sugOrigen.map((e) => (
                <option key={e.id} value={e.nombre}>
                  {e.ciudad}
                </option>
              ))}
            </datalist>
            <datalist id="estaciones-destino">
              {sugDestino.map((e) => (
                <option key={e.id} value={e.nombre}>
                  {e.ciudad}
                </option>
              ))}
            </datalist>

            <div className="space-y-2">
              <Label>{t('nuevaAlerta.cuandoViajas')}</Label>
              <div className="flex flex-wrap gap-2">
                {listaFrecuencias.map((f) => (
                  <Button
                    key={f.valor}
                    type="button"
                    variant={frecuencia === f.valor ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setFrecuencia(f.valor)}
                  >
                    {f.etiqueta}
                  </Button>
                ))}
              </div>
              {frecuencia === 'diaria' && (
                <p className="text-xs text-muted-foreground">{t('nuevaAlerta.recurrenteDiaria')}</p>
              )}
              {flexible && (
                <p className="text-xs text-muted-foreground">{t('nuevaAlerta.pistaFlexible')}</p>
              )}
              {frecuencia === 'dias' && (
                <>
                  <p className="text-xs text-muted-foreground">{t('nuevaAlerta.pistaDias')}</p>
                  <div className="flex flex-wrap gap-2">
                    {inicialesDias.map((letra, dia) => {
                      const marcado = dias.includes(dia);
                      return (
                        <Button
                          key={dia}
                          type="button"
                          variant={marcado ? 'default' : 'outline'}
                          size="sm"
                          aria-pressed={marcado}
                          className="h-8 w-8 px-0"
                          onClick={() =>
                            setDias((prev) =>
                              marcado
                                ? prev.filter((d) => d !== dia)
                                : [...prev, dia].sort((a, b) => a - b),
                            )
                          }
                        >
                          {letra}
                        </Button>
                      );
                    })}
                  </div>
                </>
              )}
            </div>

            <div
              className={`grid gap-4 ${frecuencia === 'fecha' ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}
            >
              {frecuencia === 'fecha' && (
                <div className="space-y-2">
                  <Label htmlFor="fecha">{t('nuevaAlerta.fechaLabel')}</Label>
                  <Input
                    id="fecha"
                    type="date"
                    min={fechaMin}
                    value={fecha}
                    onChange={(e) => {
                      setFecha(e.target.value);
                      setNumeroTren(''); // el tren elegido es de otra fecha
                    }}
                    required
                  />
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="horaDesde">{t('nuevaAlerta.horaDesdeLabel')}</Label>
                <Input
                  id="horaDesde"
                  type="time"
                  value={horaDesde}
                  onChange={(e) => setHoraDesde(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="horaHasta">{t('nuevaAlerta.horaHastaLabel')}</Label>
                <Input
                  id="horaHasta"
                  type="time"
                  value={horaHasta}
                  onChange={(e) => setHoraHasta(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="numeroTren">{t('nuevaAlerta.trenLabel')}</Label>
              <Input
                id="numeroTren"
                value={numeroTren}
                onChange={(e) => setNumeroTren(e.target.value)}
                placeholder={t('nuevaAlerta.trenPlaceholder')}
                maxLength={20}
              />
              {trenesSugeridos.length > 0 && !numeroTren.trim() && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-muted-foreground">{t('nuevaAlerta.proximos')}</span>
                  {trenesSugeridos.map((t) => (
                    <Button
                      key={`${t.numeroTren}-${t.salida}`}
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={() => setNumeroTren(t.numeroTren)}
                    >
                      {horaGtfs(t.salida)} · {t.numeroTren}
                      {t.operador ? ` · ${t.operador}` : ''}
                    </Button>
                  ))}
                </div>
              )}
              {trenesSugeridos.length > 0 && !numeroTren.trim() && (
                <p className="text-xs text-muted-foreground">{t('nuevaAlerta.elegirProximo')}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label>{t('nuevaAlerta.criterioLabel')}</Label>
              <div className="flex flex-wrap gap-2">
                {CRITERIOS.map((valor) => {
                  const marcado = criterios.includes(valor);
                  return (
                    <Button
                      key={valor}
                      type="button"
                      variant={marcado ? 'default' : 'outline'}
                      size="sm"
                      aria-pressed={marcado}
                      disabled={cargandoEdicion}
                      onClick={() => alternarCriterio(valor)}
                    >
                      {criteriosLargos[valor]}
                    </Button>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground">{t('nuevaAlerta.criterioPista')}</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="intervalo">{t('nuevaAlerta.intervaloLabel')}</Label>
              <select
                id="intervalo"
                className={SELECT_CLS}
                value={intervalo}
                onChange={(e) => setIntervalo(Number(e.target.value))}
              >
                {INTERVALOS_SONDEO_MIN.map((min) => (
                  <option key={min} value={min}>
                    {t('nuevaAlerta.intervaloCada', { min })}
                  </option>
                ))}
              </select>
            </div>

            {criterios.includes('PRECIO') && (
              <div className="space-y-2">
                <Label htmlFor="precioObjetivo">{t('nuevaAlerta.precioLabel')}</Label>
                <Input
                  id="precioObjetivo"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.01"
                  value={precioObjetivo}
                  onChange={(e) => setPrecioObjetivo(e.target.value)}
                  placeholder={t('nuevaAlerta.precioPlaceholder')}
                  required
                />
                <p className="text-xs text-muted-foreground">{t('nuevaAlerta.precioTexto')}</p>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="bono">{t('nuevaAlerta.bonoLabel')}</Label>
              <select
                id="bono"
                className={SELECT_CLS}
                value={bono}
                onChange={(e) => setBono(e.target.value)}
              >
                {BONOS.map((b) => (
                  <option key={b} value={b}>
                    {etiquetasBono[b] ?? b}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">{t('nuevaAlerta.bonoTexto')}</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notas">{t('nuevaAlerta.notasLabel')}</Label>
              <Textarea
                id="notas"
                value={notas}
                onChange={(e) => setNotas(e.target.value)}
                placeholder={t('nuevaAlerta.notasPlaceholder')}
                maxLength={500}
              />
            </div>

            {!editandoId && (
              <div className="space-y-2 rounded-lg border p-3">
                <div className="flex items-start gap-2">
                  <input
                    id="tambienVuelta"
                    type="checkbox"
                    checked={tambienVuelta}
                    onChange={(e) => {
                      const activo = e.target.checked;
                      setTambienVuelta(activo);
                      if (activo) {
                        if (!fechaVuelta) {
                          // Por defecto, dos días después de la ida (o de hoy)
                          const base = frecuencia === 'fecha' && fecha ? fecha : hoyIso;
                          const d = new Date(`${base}T12:00:00Z`);
                          d.setUTCDate(d.getUTCDate() + 2);
                          setFechaVuelta(d.toISOString().slice(0, 10));
                        }
                        // La vuelta arranca con la franja de la ida (editable después)
                        if (!horaDesdeVuelta) setHoraDesdeVuelta(horaDesde);
                        if (!horaHastaVuelta) setHoraHastaVuelta(horaHasta);
                      }
                    }}
                    className="mt-0.5 h-4 w-4 shrink-0 rounded border-input accent-primary"
                  />
                  <div className="space-y-1">
                    <Label htmlFor="tambienVuelta">{t('nuevaAlerta.tambienVuelta')}</Label>
                    <p className="text-xs text-muted-foreground">
                      {t('nuevaAlerta.tambienVueltaDesc')}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {t('nuevaAlerta.tambienVueltaRiesgo')}
                    </p>
                  </div>
                </div>
                {tambienVuelta && (
                  <div className="space-y-2 pt-2">
                    <Label htmlFor="fechaVuelta">{t('nuevaAlerta.fechaVueltaLabel')}</Label>
                    <Input
                      id="fechaVuelta"
                      type="date"
                      min={fechaMin}
                      value={fechaVuelta}
                      onChange={(e) => setFechaVuelta(e.target.value)}
                      required
                    />
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="horaDesdeVuelta">
                          {t('nuevaAlerta.horaDesdeVueltaLabel')}
                        </Label>
                        <Input
                          id="horaDesdeVuelta"
                          type="time"
                          value={horaDesdeVuelta}
                          onChange={(e) => setHoraDesdeVuelta(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="horaHastaVuelta">
                          {t('nuevaAlerta.horaHastaVueltaLabel')}
                        </Label>
                        <Input
                          id="horaHastaVuelta"
                          type="time"
                          value={horaHastaVuelta}
                          onChange={(e) => setHoraHastaVuelta(e.target.value)}
                        />
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {t('nuevaAlerta.pistaFranjaVuelta')}
                    </p>
                  </div>
                )}
              </div>
            )}

            <div className="space-y-1 rounded-lg border bg-muted/40 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t('nuevaAlerta.resumenTitulo')}
              </p>
              <p className="text-sm font-medium">
                {origen.trim() || '—'} → {destino.trim() || '—'}
              </p>
              <p className="text-xs text-muted-foreground">
                {[resumenFecha, resumenFranja, resumenCriterio].filter(Boolean).join(' · ')}
              </p>
              {salidasResumen.length > 0 ? (
                <p className="text-xs text-muted-foreground">
                  {t('nuevaAlerta.resumenProximas', { horas: salidasResumen.join(', ') })}
                </p>
              ) : null}
            </div>

            <Button type="submit" className="w-full" disabled={enviando}>
              {enviando
                ? t('nuevaAlerta.guardando')
                : editandoId
                  ? t('nuevaAlerta.guardarCambios')
                  : t('nuevaAlerta.crearYVigilar')}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
