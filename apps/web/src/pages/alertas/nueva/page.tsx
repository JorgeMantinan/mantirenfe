import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, BellRing } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { SELECT_CLS } from '@/lib/ui-constants';
import { BONOS, INTERVALOS_SONDEO_MIN } from '@mantirenfe/shared-types';
import {
  horaGtfs,
  type AlertaResponse,
  type EstacionResponse,
  type HorarioTrenResponse,
} from '@mantirenfe/shared-types';

const ETIQUETAS_BONOS: Record<string, string> = {
  GENERAL: 'Sin bono / general',
  BONO_10: 'Bono 10',
  BONO_20: 'Bono 20',
  JUVENIL: 'Bono Joven',
  ESTUDIANTE: 'Estudiante',
  DISCAPACIDAD: 'Discapacidad',
  FAMILIA_NUMEROSA: 'Familia numerosa',
  MAYOR_60: 'Mayor de 60',
  OTRO: 'Otro',
};

type Frecuencia = 'fecha' | 'diaria' | 'laborables';

const FRECUENCIAS: Array<{ valor: Frecuencia; etiqueta: string }> = [
  { valor: 'fecha', etiqueta: 'Una fecha' },
  { valor: 'diaria', etiqueta: 'Cada día' },
  { valor: 'laborables', etiqueta: 'Lunes a viernes' },
];

function frecuenciaDe(recurrente: boolean, soloLaborables: boolean): Frecuencia {
  if (!recurrente) return 'fecha';
  return soloLaborables ? 'laborables' : 'diaria';
}

export function PaginaNuevaAlerta() {
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
  const [intervalo, setIntervalo] = useState(10);
  const [bono, setBono] = useState('GENERAL');
  const [numeroTren, setNumeroTren] = useState('');
  const [notas, setNotas] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [estaciones, setEstaciones] = useState<EstacionResponse[]>([]);
  const [trenesSugeridos, setTrenesSugeridos] = useState<HorarioTrenResponse[]>([]);

  const hoyIso = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const fechaMin = hoyIso;
  // La fecha que viaja al servidor: un trayecto recurrente se ancla a hoy
  const fechaEfectiva = frecuencia === 'fecha' ? fecha : hoyIso;
  const recurrente = frecuencia !== 'fecha';

  // Búsqueda de estaciones mientras se escribe (con debounce): la lista inicial
  // solo traía las primeras40 alfabéticas y nunca aparecían, p.ej., las de Vigo.
  const timerBusqueda = useRef<number | undefined>(undefined);
  const peticionActual = useRef(0);

  const buscarEstaciones = (texto: string) => {
    window.clearTimeout(timerBusqueda.current);
    const q = texto.trim();
    if (q.length < 2) {
      setEstaciones([]);
      return;
    }
    timerBusqueda.current = window.setTimeout(() => {
      const id = ++peticionActual.current;
      api<EstacionResponse[]>(`/estaciones?q=${encodeURIComponent(q)}&limite=10`)
        .then((r) => {
          if (peticionActual.current === id) setEstaciones(r);
        })
        .catch(() => undefined);
    }, 250);
  };

  useEffect(() => () => window.clearTimeout(timerBusqueda.current), []);

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
          setIntervalo(a.intervaloSondeoMin);
          setBono(a.bono);
          setNotas(a.notas ?? '');
          setNumeroTren(a.numeroTren ?? '');
        })
        .catch(() => toast.error('No se pudo cargar la alerta'));
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

  const enviar = async (event: FormEvent) => {
    event.preventDefault();
    if (origen.trim().length < 2 || destino.trim().length < 2) {
      toast.error('Indica estación de origen y destino');
      return;
    }
    if (!recurrente && !fecha) {
      toast.error('Selecciona la fecha del viaje');
      return;
    }

    setEnviando(true);
    try {
      const url = editandoId ? `/alertas/${editandoId}` : '/alertas';
      const metodo = editandoId ? 'PATCH' : 'POST';
      const resultado = await api<{ id?: string; error?: unknown }>(url, {
        method: metodo,
        json: {
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
          intervaloSondeoMin: intervalo,
          bono,
          notas: notas.trim() || null,
        },
      });

      if (resultado?.error) {
        toast.error('Revisa los campos del formulario');
        return;
      }

      toast.success(editandoId ? 'Alerta actualizada.' : 'Alerta creada. Empezamos a vigilarla.');
      navigate('/alertas');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo guardar la alerta');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6 animate-fade-in">
      <div className="space-y-1">
        <Button variant="ghost" size="sm" onClick={() => navigate('/alertas')} className="-ml-2">
          <ArrowLeft aria-hidden="true" /> Volver
        </Button>
        <h1 className="font-heading text-3xl font-bold tracking-tight">
          {editandoId ? 'Editar alerta' : 'Nueva alerta'}
        </h1>
        <p className="text-muted-foreground">
          {editandoId
            ? 'Modifica cualquier dato; reiniciaremos los avisos si cambia la ruta'
            : 'Te avisaremos cuando cambie la disponibilidad de este trayecto'}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl">
            <BellRing className="h-5 w-5 text-primary" aria-hidden="true" />
            Trayecto a vigilar
          </CardTitle>
          <CardDescription>
            Cuanto más específico seas, menos avisos innecesarios recibirás
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={enviar} className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="origen">Origen</Label>
                <Input
                  id="origen"
                  list="estaciones"
                  value={origen}
                  onChange={(e) => {
                    setOrigen(e.target.value);
                    buscarEstaciones(e.target.value);
                    setNumeroTren(''); // la ruta cambió: el tren elegido ya no aplica
                  }}
                  placeholder="Madrid-Atocha"
                  required
                  minLength={2}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="destino">Destino</Label>
                <Input
                  id="destino"
                  list="estaciones"
                  value={destino}
                  onChange={(e) => {
                    setDestino(e.target.value);
                    buscarEstaciones(e.target.value);
                    setNumeroTren('');
                  }}
                  placeholder="Barcelona-Sants"
                  required
                  minLength={2}
                />
              </div>
            </div>
            <datalist id="estaciones">
              {estaciones.map((e) => (
                <option key={e.id} value={e.nombre}>
                  {e.ciudad}
                </option>
              ))}
            </datalist>

            <div className="space-y-2">
              <Label>¿Cuándo viajas?</Label>
              <div className="flex flex-wrap gap-2">
                {FRECUENCIAS.map((f) => (
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
                  Trayecto cotidiano: te avisaremos cada día
                  {frecuencia === 'laborables' ? ', de lunes a viernes' : ''}. No hace falta fecha:
                  se renueva automáticamente.
                </p>
              )}
            </div>

            <div
              className={`grid gap-4 ${frecuencia === 'fecha' ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}
            >
              {frecuencia === 'fecha' && (
                <div className="space-y-2">
                  <Label htmlFor="fecha">Fecha del viaje</Label>
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
                <Label htmlFor="horaDesde">Hora desde (opcional)</Label>
                <Input
                  id="horaDesde"
                  type="time"
                  value={horaDesde}
                  onChange={(e) => setHoraDesde(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="horaHasta">Hora hasta (opcional)</Label>
                <Input
                  id="horaHasta"
                  type="time"
                  value={horaHasta}
                  onChange={(e) => setHoraHasta(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="numeroTren">Tren concreto (opcional)</Label>
              <Input
                id="numeroTren"
                value={numeroTren}
                onChange={(e) => setNumeroTren(e.target.value)}
                placeholder="Ej.: 03311 — vacío = se vigila todos los trenes"
                maxLength={20}
              />
              {trenesSugeridos.length > 0 && !numeroTren.trim() && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-muted-foreground">Próximos:</span>
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
                <p className="text-xs text-muted-foreground">
                  Elige uno de los próximos o déjalo en blanco para vigilar todos.
                </p>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="criterio">Qué quieres detectar</Label>
                <select
                  id="criterio"
                  className={SELECT_CLS}
                  value={criterio}
                  onChange={(e) => setCriterio(e.target.value)}
                >
                  <option value="DISPONIBILIDAD">Que se libere una plaza</option>
                  <option value="HORARIO">Cambios de horario</option>
                  <option value="RETRASO">Retrasos del tren</option>
                  <option value="APERTURA_VENTA">Apertura de venta de billetes</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="intervalo">Frecuencia de sondeo</Label>
                <select
                  id="intervalo"
                  className={SELECT_CLS}
                  value={intervalo}
                  onChange={(e) => setIntervalo(Number(e.target.value))}
                >
                  {INTERVALOS_SONDEO_MIN.map((min) => (
                    <option key={min} value={min}>
                      Cada {min} minutos
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="bono">Tu bono / perfil</Label>
              <select
                id="bono"
                className={SELECT_CLS}
                value={bono}
                onChange={(e) => setBono(e.target.value)}
              >
                {BONOS.map((b) => (
                  <option key={b} value={b}>
                    {ETIQUETAS_BONOS[b] ?? b}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">
                Guardamos tu perfil para personalizar los avisos. Renfe no publica las plazas por
                cupo de bono/abono en sus datos públicos: los avisos de disponibilidad se calculan
                sobre las tarifas generales de venta.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notas">Notas (opcional)</Label>
              <Textarea
                id="notas"
                value={notas}
                onChange={(e) => setNotas(e.target.value)}
                placeholder="Ej.: solo clase Turista, quiero el tren de la tarde..."
                maxLength={500}
              />
            </div>

            <Button type="submit" className="w-full" disabled={enviando}>
              {enviando
                ? 'Guardando...'
                : editandoId
                  ? 'Guardar cambios'
                  : 'Crear alerta y empezar a vigilar'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
