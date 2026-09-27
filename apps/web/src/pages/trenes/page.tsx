import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { BellPlus, Search, TrainFront } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import {
  horaGtfs,
  type EstacionResponse,
  type HorarioTrenResponse,
} from '@mantirenfe/shared-types';

export function PaginaTrenes() {
  const navigate = useNavigate();
  const [origen, setOrigen] = useState('');
  const [destino, setDestino] = useState('');
  const [fecha, setFecha] = useState('');
  const [resultados, setResultados] = useState<HorarioTrenResponse[] | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fuente, setFuente] = useState<string | null>(null);
  const [sugOrigen, setSugOrigen] = useState<EstacionResponse[]>([]);
  const [sugDestino, setSugDestino] = useState<EstacionResponse[]>([]);
  const timerOrigen = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const timerDestino = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const petOrigen = useRef(0);
  const petDestino = useRef(0);

  useEffect(
    () => () => {
      clearTimeout(timerOrigen.current);
      clearTimeout(timerDestino.current);
    },
    [],
  );

  // Búsqueda con debounce mientras se escribe (patrón del móvil)
  const sugerir = (campo: 'origen' | 'destino', texto: string) => {
    const timer = campo === 'origen' ? timerOrigen : timerDestino;
    const peticion = campo === 'origen' ? petOrigen : petDestino;
    const set = campo === 'origen' ? setSugOrigen : setSugDestino;
    if (campo === 'origen') setOrigen(texto);
    else setDestino(texto);
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
    if (campo === 'origen') {
      setOrigen(nombre);
      setSugOrigen([]);
    } else {
      setDestino(nombre);
      setSugDestino([]);
    }
  };

  const buscar = async (event: FormEvent) => {
    event.preventDefault();
    if (!origen.trim() || !destino.trim() || !fecha) return;
    setCargando(true);
    setError(null);
    try {
      const datos = await api<{ trenes: HorarioTrenResponse[]; fuente: string }>(
        `/trenes/horarios?origen=${encodeURIComponent(origen.trim())}&destino=${encodeURIComponent(destino.trim())}&fecha=${fecha}`,
      );
      setResultados(datos.trenes);
      setFuente(datos.fuente);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error en la búsqueda');
      setResultados(null);
    } finally {
      setCargando(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6 animate-fade-in">
      <div>
        <h1 className="font-heading text-3xl font-bold tracking-tight">Buscar trenes</h1>
        <p className="text-muted-foreground">
          Horarios programados entre estaciones (datos GTFS de Renfe)
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
              {resultados.length === 0
                ? 'Sin trenes disponibles para esa consulta'
                : `${resultados.length} trenes · fuente: ${fuente ?? 'cache'}`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {resultados.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-8 text-center">
                <TrainFront className="h-10 w-10 text-muted-foreground/50" aria-hidden="true" />
                <p className="text-sm text-muted-foreground">
                  No hay trenes de <strong>{origen}</strong> a <strong>{destino}</strong> para el{' '}
                  <strong>{fecha}</strong> (ni directos ni con transbordo). Prueba con otra fecha o
                  divide el viaje en dos tramos.
                </p>
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
                      {t.operador && <Badge variant="secondary">{t.operador}</Badge>}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          navigate(
                            `/alertas/nueva?origen=${encodeURIComponent(t.origenNombre)}` +
                              `&destino=${encodeURIComponent(t.destinoNombre)}` +
                              `&fecha=${fecha}` +
                              (t.transbordo
                                ? ''
                                : `&numeroTren=${encodeURIComponent(t.numeroTren)}`),
                          )
                        }
                      >
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
    </div>
  );
}
