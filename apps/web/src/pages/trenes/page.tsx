import { useState, type FormEvent } from 'react';
import { Search, TrainFront } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import type { HorarioTrenResponse } from '@mantirenfe/shared-types';

export function PaginaTrenes() {
  const [origen, setOrigen] = useState('');
  const [destino, setDestino] = useState('');
  const [fecha, setFecha] = useState('');
  const [resultados, setResultados] = useState<HorarioTrenResponse[] | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fuente, setFuente] = useState<string | null>(null);

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
            <div className="space-y-2">
              <Label htmlFor="origen">Origen</Label>
              <Input
                id="origen"
                value={origen}
                onChange={(e) => setOrigen(e.target.value)}
                placeholder="Madrid-Atocha"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="destino">Destino</Label>
              <Input
                id="destino"
                value={destino}
                onChange={(e) => setDestino(e.target.value)}
                placeholder="Sevilla-Santa Justa"
                required
              />
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
                ? 'Sin horarios en caché para esa consulta'
                : `${resultados.length} trenes · fuente: ${fuente ?? 'cache'}`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {resultados.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-8 text-center">
                <TrainFront className="h-10 w-10 text-muted-foreground/50" aria-hidden="true" />
                <p className="text-sm text-muted-foreground">
                  Aún no hay horarios sincronizados para esta ruta. El worker los importa del GTFS
                  de Renfe a diario; puedes lanzar <code>pnpm db:seed</code> o esperar al sync.
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
                        {new Date(t.salida).toLocaleTimeString('es-ES', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}{' '}
                        →{' '}
                        {new Date(t.llegada).toLocaleTimeString('es-ES', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {t.origenNombre} · {t.destinoNombre} · {t.duracionMin} min
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{t.numeroTren}</Badge>
                      {t.operador && <Badge variant="secondary">{t.operador}</Badge>}
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
