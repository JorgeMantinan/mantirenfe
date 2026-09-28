import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { BellPlus, Search, TrainFront } from 'lucide-react';
import { api } from '@/lib/api';
import { BloqueBilletes } from '@/components/BloqueBilletes';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import {
  esOuigo,
  horaGtfs,
  type EstacionResponse,
  type HorarioTrenResponse,
  type HorariosResponse,
  type MotivoHorarios,
} from '@mantirenfe/shared-types';

/**
 * Agrupa el `operador` de horarioTren para poder comparar operadores: los
 * feeds de Renfe guardan marcas ("AVE", "AVLO", "MD") o el nombre de la ruta,
 * no el nombre del operador.
 */
function grupoOperador(operador: string | null | undefined): 'Renfe' | 'Ouigo' | 'Iryo' | null {
  if (!operador) return null;
  if (esOuigo(operador)) return 'Ouigo';
  if (operador.toUpperCase().includes('IRYO')) return 'Iryo';
  return 'Renfe';
}

export function PaginaTrenes() {
  const navigate = useNavigate();
  const [origen, setOrigen] = useState('');
  const [destino, setDestino] = useState('');
  const [fecha, setFecha] = useState('');
  const [resultados, setResultados] = useState<HorarioTrenResponse[] | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fuente, setFuente] = useState<string | null>(null);
  // Motivo de una respuesta vacía: estación inexistente vs. sin trenes
  const [motivo, setMotivo] = useState<MotivoHorarios | null>(null);
  const [sinEstacion, setSinEstacion] = useState<string[]>([]);
  const [sugOrigen, setSugOrigen] = useState<EstacionResponse[]>([]);
  const [sugDestino, setSugDestino] = useState<EstacionResponse[]>([]);
  const timerOrigen = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const timerDestino = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const petOrigen = useRef(0);
  const petDestino = useRef(0);

  // Operadores presentes en los resultados (para poder compararlos)
  const operadoresEncontrados = useMemo(() => {
    const presentes = new Set((resultados ?? []).map((t) => grupoOperador(t.operador)));
    return (['Renfe', 'Ouigo', 'Iryo'] as const).filter((grupo) => presentes.has(grupo));
  }, [resultados]);
  const hayOuigo = operadoresEncontrados.includes('Ouigo');

  useEffect(
    () => () => {
      clearTimeout(timerOrigen.current);
      clearTimeout(timerDestino.current);
    },
    [],
  );

  // Cierra los dos desplegables y cancela sus peticiones pendientes: escribir
  // en un campo (o elegir una opción) no debe dejar a la vista la lista del otro.
  const limpiarSugerencias = (conservar?: 'origen' | 'destino') => {
    if (conservar !== 'origen') {
      petOrigen.current++;
      clearTimeout(timerOrigen.current);
      setSugOrigen([]);
    }
    if (conservar !== 'destino') {
      petDestino.current++;
      clearTimeout(timerDestino.current);
      setSugDestino([]);
    }
  };

  // Búsqueda con debounce mientras se escribe (patrón del móvil)
  const sugerir = (campo: 'origen' | 'destino', texto: string) => {
    const timer = campo === 'origen' ? timerOrigen : timerDestino;
    const peticion = campo === 'origen' ? petOrigen : petDestino;
    const set = campo === 'origen' ? setSugOrigen : setSugDestino;
    if (campo === 'origen') setOrigen(texto);
    else setDestino(texto);
    limpiarSugerencias(campo);
    clearTimeout(timer.current);
    if (texto.trim().length < 2) {
      set([]);
      return;
    }
    timer.current = setTimeout(() => {
      const id = ++peticion.current;
      api<EstacionResponse[]>(`/estaciones?q=${encodeURIComponent(texto.trim())}&limite=5`)
        .then((r) => {
          if (peticion.current === id) set(r);
        })
        .catch(() => {
          if (peticion.current === id) set([]);
        });
    }, 250);
  };

  const elegir = (campo: 'origen' | 'destino', nombre: string) => {
    if (campo === 'origen') setOrigen(nombre);
    else setDestino(nombre);
    limpiarSugerencias();
  };

  const buscar = async (event: FormEvent) => {
    event.preventDefault();
    if (!origen.trim() || !destino.trim() || !fecha) return;
    limpiarSugerencias();
    setCargando(true);
    setError(null);
    setMotivo(null);
    setSinEstacion([]);
    try {
      const datos = await api<HorariosResponse>(
        `/trenes/horarios?origen=${encodeURIComponent(origen.trim())}&destino=${encodeURIComponent(destino.trim())}&fecha=${fecha}`,
      );
      setResultados(datos.trenes);
      setFuente(datos.fuente);
      setMotivo(datos.motivo ?? null);
      setSinEstacion(datos.estacionesNoEncontradas ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error en la búsqueda');
      setResultados(null);
    } finally {
      setCargando(false);
    }
  };

  // CTA compartido: crear una alerta de disponibilidad con la ruta consultada
  // (si se parte de un tren concreto, se le pasa su número para vigilarlo).
  const navegarAlerta = (t?: HorarioTrenResponse) => {
    navigate(
      `/alertas/nueva?origen=${encodeURIComponent(t?.origenNombre ?? origen.trim())}` +
        `&destino=${encodeURIComponent(t?.destinoNombre ?? destino.trim())}` +
        `&fecha=${fecha}` +
        (t && !t.transbordo ? `&numeroTren=${encodeURIComponent(t.numeroTren)}` : ''),
    );
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6 animate-fade-in">
      <div>
        <h1 className="font-heading text-3xl font-bold tracking-tight">Buscar trenes</h1>
        <p className="text-muted-foreground">
          Horarios programados entre estaciones (GTFS de Renfe y de los demás operadores
          sincronizados)
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl">
            <Search className="h-5 w-5 text-primary" aria-hidden="true" /> Tu trayecto
          </CardTitle>
          <CardDescription>Consulta sin cuenta. Las alertas sí requieren login.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={buscar} className="grid gap-4 sm:grid-cols-3">
            <div className="relative space-y-2">
              <Label htmlFor="origen">Origen</Label>
              <Input
                id="origen"
                value={origen}
                onChange={(e) => sugerir('origen', e.target.value)}
                placeholder="Madrid-Atocha"
                required
                autoComplete="off"
              />
              {sugOrigen.length > 0 && (
                <ul className="absolute left-0 right-0 top-full z-10 mt-1 rounded-md border bg-popover shadow-md">
                  {sugOrigen.map((e) => (
                    <li key={e.id}>
                      <button
                        type="button"
                        className="w-full px-3 py-2 text-left text-sm hover:bg-accent"
                        onClick={() => elegir('origen', e.nombre)}
                      >
                        {e.nombre}
                        {e.ciudad ? (
                          <span className="text-muted-foreground"> · {e.ciudad}</span>
                        ) : null}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="relative space-y-2">
              <Label htmlFor="destino">Destino</Label>
              <Input
                id="destino"
                value={destino}
                onChange={(e) => sugerir('destino', e.target.value)}
                placeholder="Sevilla-Santa Justa"
                required
                autoComplete="off"
              />
              {sugDestino.length > 0 && (
                <ul className="absolute left-0 right-0 top-full z-10 mt-1 rounded-md border bg-popover shadow-md">
                  {sugDestino.map((e) => (
                    <li key={e.id}>
                      <button
                        type="button"
                        className="w-full px-3 py-2 text-left text-sm hover:bg-accent"
                        onClick={() => elegir('destino', e.nombre)}
                      >
                        {e.nombre}
                        {e.ciudad ? (
                          <span className="text-muted-foreground"> · {e.ciudad}</span>
                        ) : null}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="fecha">Fecha</Label>
              <Input
                id="fecha"
                type="date"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                min={new Date().toISOString().slice(0, 10)}
                required
              />
            </div>
            <div className="sm:col-span-3">
              <Button type="submit" className="w-full sm:w-auto" disabled={cargando}>
                {cargando ? 'Buscando...' : 'Buscar horarios'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm">
          {error}
        </div>
      )}

      {cargando && (
        <div className="space-y-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      )}

      {!cargando && resultados !== null && (
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Resultados</CardTitle>
            <CardDescription>
              {resultados.length > 0
                ? `${resultados.length} trenes · fuente: ${fuente ?? 'cache'}`
                : motivo === 'estaciones'
                  ? 'Estación no encontrada'
                  : 'Sin trenes directos ni con conexión para esa fecha'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {resultados.length > 0 && (
              <div className="mb-4 rounded-lg border border-dashed bg-muted/40 px-3 py-2">
                <p className="text-sm font-medium">
                  Compara operadores: {operadoresEncontrados.join(' · ')}
                </p>
                <p className="text-xs text-muted-foreground">
                  Las alertas cubren solo lo que su criterio alcance: disponibilidad y retraso se
                  miden con datos de Renfe, y el horario con este mismo GTFS.
                  {hayOuigo ? (
                    <>
                      {' '}
                      Por eso un tren de Ouigo no se vigila con una alerta de disponibilidad. Datos
                      de Ouigo: NAP del Ministerio —{' '}
                      <a
                        href="https://www.transportes.gob.es"
                        target="_blank"
                        rel="noreferrer"
                        className="underline"
                      >
                        Powered by MITRAMS
                      </a>
                      .
                    </>
                  ) : null}
                </p>
              </div>
            )}
            {resultados.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-8 text-center">
                <TrainFront className="h-10 w-10 text-muted-foreground/50" aria-hidden="true" />
                {motivo === 'estaciones' ? (
                  <>
                    <p className="text-sm text-muted-foreground">
                      No encontramos la estación{' '}
                      <strong>
                        {sinEstacion.length > 0
                          ? sinEstacion.map((s) => `«${s}»`).join(' y ')
                          : 'indicada'}
                      </strong>
                      . Revisa el nombre (tildes, «La Coruña» = «A Coruña») o elige una sugerencia
                      al escribir.
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Si no aparece, prueba a buscarla en{' '}
                      <button
                        type="button"
                        className="underline"
                        onClick={() => navigate('/estaciones')}
                      >
                        estaciones
                      </button>
                      .
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-sm text-muted-foreground">
                      Sin trenes directos ni con conexión de <strong>{origen}</strong> a{' '}
                      <strong>{destino}</strong> para el <strong>{fecha}</strong>. Prueba con otra
                      fecha o divide el viaje en dos tramos.
                    </p>
                    <Button type="button" onClick={() => navegarAlerta()}>
                      <BellPlus className="h-4 w-4" aria-hidden="true" /> Crear alerta de
                      disponibilidad
                    </Button>
                    <p className="text-xs text-muted-foreground">
                      Te avisamos cuando Renfe abra plazas para esa ruta y fecha.
                    </p>
                  </>
                )}
              </div>
            ) : (
              <ul className="divide-y">
                {resultados.map((t) => (
                  <li
                    key={`${t.numeroTren}-${t.salida}`}
                    className="flex flex-wrap items-center justify-between gap-3 py-3"
                  >
                    <div>
                      <p className="font-medium">
                        {horaGtfs(t.salida)} → {horaGtfs(t.llegada)}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {t.origenNombre} · {t.destinoNombre} · {t.duracionMin} min
                      </p>
                      {t.transbordo && (
                        <div className="mt-1 space-y-0.5">
                          <Badge
                            variant="outline"
                            className="border-amber-500 text-amber-700 dark:text-amber-400"
                          >
                            Transbordo en {t.transbordo.estacion}
                          </Badge>
                          <p className="text-xs text-muted-foreground">
                            {t.transbordo.trenPrimera} llega a las{' '}
                            {horaGtfs(t.transbordo.llegadaPrimera)} · espera{' '}
                            {t.transbordo.esperaMin} min · {t.transbordo.trenSegunda} sale a las{' '}
                            {horaGtfs(t.transbordo.salidaSegunda)}
                          </p>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{t.numeroTren}</Badge>
                      {t.operador && (
                        <Badge variant={esOuigo(t.operador) ? 'aviso' : 'secondary'}>
                          {t.operador}
                        </Badge>
                      )}
                      <Button variant="outline" size="sm" onClick={() => navegarAlerta(t)}>
                        <BellPlus className="h-4 w-4" aria-hidden="true" /> Alerta
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      <BloqueBilletes />
    </div>
  );
}
