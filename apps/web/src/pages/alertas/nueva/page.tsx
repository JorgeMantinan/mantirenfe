import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, BellRing } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { construirAlertaVuelta } from '@/lib/alertas';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { SELECT_CLS } from '@/lib/ui-constants';
import { fechaCorta } from '@/lib/proximoViaje';
import { BONOS, INTERVALOS_SONDEO_MIN } from '@mantirenfe/shared-types';
import type { TFunction } from 'i18next';
import {
  horaGtfs,
  type AlertaResponse,
  type EstacionResponse,
  type HorarioTrenResponse,
} from '@mantirenfe/shared-types';

type Frecuencia = 'fecha' | 'diaria' | 'laborables';

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

/** Etiquetas cortas del criterio para el resumen (el select usa textos más largos). */
function etiquetasCriterio(t: TFunction): Record<string, string> {
  return {
    DISPONIBILIDAD: t('nuevaAlerta.criterioPlazas'),
    RETRASO: t('nuevaAlerta.criterioRetraso'),
    HORARIO: t('nuevaAlerta.criterioHorarioCorto'),
    APERTURA_VENTA: t('nuevaAlerta.criterioVentaCorta'),
    PRECIO: t('nuevaAlerta.criterioPrecioCorto'),
  };
}

function frecuencias(t: TFunction): Array<{ valor: Frecuencia; etiqueta: string }> {
  return [
    { valor: 'fecha', etiqueta: t('nuevaAlerta.frecuenciaFecha') },
    { valor: 'diaria', etiqueta: t('nuevaAlerta.frecuenciaDiaria') },
    { valor: 'laborables', etiqueta: t('nuevaAlerta.frecuenciaLaborables') },
  ];
}

function frecuenciaDe(recurrente: boolean, soloLaborables: boolean): Frecuencia {
  if (!recurrente) return 'fecha';
  return soloLaborables ? 'laborables' : 'diaria';
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
  const [horaDesde, setHoraDesde] = useState('');
  const [horaHasta, setHoraHasta] = useState('');
  const [criterio, setCriterio] = useState('DISPONIBILIDAD');
  const [precioObjetivo, setPrecioObjetivo] = useState('');
  const [intervalo, setIntervalo] = useState(10);
  const [bono, setBono] = useState('GENERAL');
  const [numeroTren, setNumeroTren] = useState('');
  const [notas, setNotas] = useState('');
  const [tambienVuelta, setTambienVuelta] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [sugOrigen, setSugOrigen] = useState<EstacionResponse[]>([]);
  const [sugDestino, setSugDestino] = useState<EstacionResponse[]>([]);
  const [trenesSugeridos, setTrenesSugeridos] = useState<HorarioTrenResponse[]>([]);

  const hoyIso = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const fechaMin = hoyIso;
  // La fecha que viaja al servidor: un trayecto recurrente se ancla a hoy
  const fechaEfectiva = frecuencia === 'fecha' ? fecha : hoyIso;
  const recurrente = frecuencia !== 'fecha';

  // Búsqueda de estaciones mientras se escribe (con debounce): la lista inicial
  // solo traía las primeras40 alfabéticas y nunca aparecían, p.ej., las de Vigo.
  // Una lista por campo (mismo patrón que la página de trenes): así escribir en
  // Destino no deja a la vista las sugerencias de Origen ni viceversa.
  const timerOrigen = useRef<number | undefined>(undefined);
  const timerDestino = useRef<number | undefined>(undefined);
  const petOrigen = useRef(0);
  const petDestino = useRef(0);

  // Cierra los dos desplegables y cancela sus peticiones pendientes: escribir
  // en un campo (o elegir una opción) no debe dejar a la vista la lista del otro.
  const limpiarSugerencias = (conservar?: 'origen' | 'destino') => {
    if (conservar !== 'origen') {
      petOrigen.current++;
      window.clearTimeout(timerOrigen.current);
      setSugOrigen([]);
    }
    if (conservar !== 'destino') {
      petDestino.current++;
      window.clearTimeout(timerDestino.current);
      setSugDestino([]);
    }
  };

  const sugerir = (campo: 'origen' | 'destino', texto: string) => {
    const timer = campo === 'origen' ? timerOrigen : timerDestino;
    const peticion = campo === 'origen' ? petOrigen : petDestino;
    const set = campo === 'origen' ? setSugOrigen : setSugDestino;
    limpiarSugerencias(campo);
    window.clearTimeout(timer.current);
    const q = texto.trim();
    if (q.length < 2) {
      set([]);
      return;
    }
    timer.current = window.setTimeout(() => {
      const id = ++peticion.current;
      api<EstacionResponse[]>(`/estaciones?q=${encodeURIComponent(q)}&limite=10`)
        .then((r) => {
          if (peticion.current === id) set(r);
        })
        .catch(() => {
          if (peticion.current === id) set([]);
        });
    }, 250);
  };

  useEffect(
    () => () => {
      window.clearTimeout(timerOrigen.current);
      window.clearTimeout(timerDestino.current);
    },
    [],
  );

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

    if (editandoId) {
      api<AlertaResponse>(`/alertas/${editandoId}`)
        .then((a) => {
          setOrigen(a.origenNombre);
          setDestino(a.destinoNombre);
          setFecha(a.fechaViaje);
          setFrecuencia(frecuenciaDe(a.recurrente, a.soloLaborables));
          setHoraDesde(a.horaDesde ?? '');
          setHoraHasta(a.horaHasta ?? '');
          setCriterio(a.criterio);
          setPrecioObjetivo(a.precioObjetivo != null ? String(a.precioObjetivo) : '');
          setIntervalo(a.intervaloSondeoMin);
          setBono(a.bono);
          setNotas(a.notas ?? '');
          setNumeroTren(a.numeroTren ?? '');
        })
        .catch(() => toast.error(t('nuevaAlerta.errorCargar')));
    }
  }, [params, editandoId]);

  // Los 3 próximos trenes de la ruta (para elegir sin escribir el número)
  useEffect(() => {
    if (origen.trim().length < 2 || destino.trim().length < 2 || !fechaEfectiva) {
      setTrenesSugeridos([]);
      return;
    }
    const controlador = new AbortController();
    const timer = window.setTimeout(() => {
      api<{ trenes: HorarioTrenResponse[] }>(
        `/trenes/horarios?origen=${encodeURIComponent(origen.trim())}&destino=${encodeURIComponent(destino.trim())}&fecha=${fechaEfectiva}`,
        { signal: controlador.signal },
      )
        .then((d) => {
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
    return () => {
      window.clearTimeout(timer);
      controlador.abort();
    };
  }, [origen, destino, fechaEfectiva, hoyIso]);

  // Resumen de la alerta: se recalcula en cada render con los campos actuales,
  // para poder distinguir dos alertas de la misma ruta (caja + toast final).
  const criterioEtiqueta = etiquetasCriterio(t)[criterio] ?? criterio;
  const resumenFecha = recurrente
    ? frecuencia === 'laborables'
      ? t('nuevaAlerta.resumenLunesViernes')
      : t('nuevaAlerta.resumenCadaDia')
    : fecha
      ? fechaCorta(fecha)
      : t('nuevaAlerta.resumenSinFecha');
  const resumenFranja =
    horaDesde || horaHasta ? `${horaDesde || '00:00'}–${horaHasta || '23:59'}` : null;
  const resumenCriterio = [
    criterioEtiqueta,
    criterio === 'PRECIO' && precioObjetivo ? `≤ ${precioObjetivo} €` : null,
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
    if (!recurrente && !fecha) {
      toast.error(t('nuevaAlerta.errorFecha'));
      return;
    }
    const objetivo = Number(precioObjetivo);
    if (criterio === 'PRECIO' && !(Number.isFinite(objetivo) && objetivo > 0)) {
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
        // Un trayecto cotidiano se ancla a hoy: la fecha dejó de importar
        fechaViaje: fechaEfectiva,
        recurrente,
        soloLaborables: frecuencia === 'laborables',
        horaDesde: horaDesde || null,
        horaHasta: horaHasta || null,
        numeroTren: numeroTren.trim() || null,
        criterio,
        // Solo aplica con criterio PRECIO; en el resto lo mandamos a null
        precioObjetivo: criterio === 'PRECIO' ? objetivo : null,
        intervaloSondeoMin: intervalo,
        bono,
        notas: notas.trim() || null,
      };
      // Formulario de la vuelta precargado (extremos invertidos): lo usan la
      // acción del toast y el aviso de fallo para poder reintentarla.
      const rutaVuelta = `/alertas/nueva?origen=${encodeURIComponent(
        datos.destinoNombre,
      )}&destino=${encodeURIComponent(datos.origenNombre)}&fecha=${encodeURIComponent(
        fechaEfectiva,
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
            json: construirAlertaVuelta(datos),
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
                {frecuencias(t).map((f) => (
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
              {recurrente && (
                <p className="text-xs text-muted-foreground">
                  {frecuencia === 'laborables'
                    ? t('nuevaAlerta.recurrenteLaborables')
                    : t('nuevaAlerta.recurrenteDiaria')}
                </p>
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

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="criterio">{t('nuevaAlerta.criterioLabel')}</Label>
                <select
                  id="criterio"
                  className={SELECT_CLS}
                  value={criterio}
                  onChange={(e) => setCriterio(e.target.value)}
                >
                  <option value="DISPONIBILIDAD">{t('nuevaAlerta.criterioDisponibilidad')}</option>
                  <option value="HORARIO">{t('nuevaAlerta.criterioHorario')}</option>
                  <option value="RETRASO">{t('nuevaAlerta.criterioRetrasoTren')}</option>
                  <option value="APERTURA_VENTA">{t('nuevaAlerta.criterioVenta')}</option>
                  <option value="PRECIO">{t('nuevaAlerta.criterioPrecio')}</option>
                </select>
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
            </div>

            {criterio === 'PRECIO' && (
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
                    {etiquetasBonos(t)[b] ?? b}
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
                    onChange={(e) => setTambienVuelta(e.target.checked)}
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
