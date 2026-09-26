import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
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
import type { EstacionResponse } from '@mantirenfe/shared-types';

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

export function PaginaNuevaAlerta() {
  const navigate = useNavigate();
  const [origen, setOrigen] = useState('');
  const [destino, setDestino] = useState('');
  const [fecha, setFecha] = useState('');
  const [horaDesde, setHoraDesde] = useState('');
  const [horaHasta, setHoraHasta] = useState('');
  const [criterio, setCriterio] = useState('DISPONIBILIDAD');
  const [intervalo, setIntervalo] = useState(10);
  const [bono, setBono] = useState('GENERAL');
  const [notas, setNotas] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [estaciones, setEstaciones] = useState<EstacionResponse[]>([]);

  const fechaMin = useMemo(() => new Date().toISOString().slice(0, 10), []);

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

  const enviar = async (event: FormEvent) => {
    event.preventDefault();
    if (origen.trim().length < 2 || destino.trim().length < 2) {
      toast.error('Indica estación de origen y destino');
      return;
    }
    if (!fecha) {
      toast.error('Selecciona la fecha del viaje');
      return;
    }

    setEnviando(true);
    try {
      const resultado = await api<{ id?: string; error?: unknown }>('/alertas', {
        method: 'POST',
        json: {
          origenNombre: origen.trim(),
          destinoNombre: destino.trim(),
          fechaViaje: fecha,
          horaDesde: horaDesde || null,
          horaHasta: horaHasta || null,
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

      toast.success('Alerta creada. Empezamos a vigilarla.');
      navigate('/alertas');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo crear la alerta');
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
        <h1 className="font-heading text-3xl font-bold tracking-tight">Nueva alerta</h1>
        <p className="text-muted-foreground">
          Te avisaremos cuando cambie la disponibilidad de este trayecto
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

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="fecha">Fecha del viaje</Label>
                <Input
                  id="fecha"
                  type="date"
                  min={fechaMin}
                  value={fecha}
                  onChange={(e) => setFecha(e.target.value)}
                  required
                />
              </div>
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
              {enviando ? 'Creando...' : 'Crear alerta y empezar a vigilar'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
