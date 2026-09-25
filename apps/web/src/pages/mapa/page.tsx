import { useCallback, useEffect, useState } from 'react';
import { CircleDot, RefreshCw } from 'lucide-react';
import { MapContainer, TileLayer, CircleMarker, Popup, Polyline, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { PosicionTrenResponse, PuntoTraza } from '@mantirenfe/shared-types';

const CENTRO_ESPANIA: [number, number] = [40.2, -3.7];

function Actualizador({ posiciones }: { posiciones: PosicionTrenResponse[] }) {
  const map = useMap();
  useEffect(() => {
    if (posiciones.length > 0) {
      map.invalidateSize();
    }
  }, [map, posiciones.length]);
  return null;
}

export function PaginaMapa() {
  const [trenes, setTrenes] = useState<PosicionTrenResponse[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [traza, setTraza] = useState<{ vehiculo: string; puntos: PuntoTraza[] } | null>(null);
  const [cargandoTraza, setCargandoTraza] = useState(false);

  const alternarTraza = useCallback(
    async (vehiculo: string) => {
      if (traza?.vehiculo === vehiculo) {
        setTraza(null);
        return;
      }
      setCargandoTraza(true);
      try {
        const datos = await api<{ vehiculo: string; puntos: PuntoTraza[] }>(
          `/trenes/posiciones/traza?vehiculo=${encodeURIComponent(vehiculo)}&horas=24`,
        );
        setTraza(datos);
      } catch {
        // popup efímero: no bloquear el mapa por un error de la traza
      } finally {
        setCargandoTraza(false);
      }
    },
    [traza?.vehiculo],
  );

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const datos = await api<{ trenes: PosicionTrenResponse[]; total: number }>(
        '/trenes/posiciones',
      );
      setTrenes(datos.trenes);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron cargar las posiciones');
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    void cargar();
    const intervalo = window.setInterval(() => {
      void api<{ trenes: PosicionTrenResponse[] }>('/trenes/posiciones')
        .then((d) => setTrenes(d.trenes))
        .catch(() => undefined);
    }, 30_000);
    return () => window.clearInterval(intervalo);
  }, [cargar]);

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-3xl font-bold tracking-tight">Mapa en tiempo real</h1>
          <p className="text-muted-foreground">
            Posiciones GTFS-RT de Cercanías y Larga Distancia · actualización cada 30 s
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">
            {trenes ? `${trenes.length} trenes` : '—'}
          </span>
          <Button variant="outline" size="sm" onClick={() => void cargar()} disabled={cargando}>
            <RefreshCw className={cargando ? 'animate-spin' : ''} aria-hidden="true" /> Actualizar
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
          {error} — comprueba la API o la URL de GTFS-RT en <code>.env</code>.
        </div>
      )}

      <Card className="overflow-hidden">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-lg">
            <CircleDot className="h-4 w-4 text-primary" aria-hidden="true" /> Red ferroviaria
          </CardTitle>
          <CardDescription>
            Datos: Renfe Operadora (open data CC-BY 4.0) · Cartografía © OpenStreetMap
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {cargando && trenes === null ? (
            <Skeleton className="h-[480px] w-full rounded-none" />
          ) : (
            <MapContainer
              center={CENTRO_ESPANIA}
              zoom={6}
              className="h-[480px] w-full"
              scrollWheelZoom
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
              />
              <Actualizador posiciones={trenes ?? []} />
              {(trenes ?? []).map((tren) => (
                <CircleMarker
                  key={tren.id}
                  center={[tren.latitud, tren.longitud]}
                  radius={7}
                  pathOptions={{
                    color: '#75258c',
                    fillColor: '#75258c',
                    fillOpacity: 0.85,
                    weight: 2,
                  }}
                >
                  <Popup>
                    <div className="space-y-1 text-sm">
                      <strong>{tren.numeroTren ?? 'Tren'}</strong>
                      {tren.velocidadKmh != null && <p>{tren.velocidadKmh} km/h</p>}
                      {tren.retrasoSeg != null && (
                        <p className={tren.retrasoSeg >= 300 ? 'font-semibold text-red-600' : ''}>
                          {tren.retrasoSeg > 0
                            ? `Retraso +${Math.round(tren.retrasoSeg / 60)} min`
                            : 'A tiempo'}
                        </p>
                      )}
                      <p className="text-xs text-gray-500">
                        Actualizado {new Date(tren.actualizadaEn).toLocaleTimeString('es-ES')}
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={cargandoTraza}
                        onClick={() => void alternarTraza(tren.id)}
                      >
                        {cargandoTraza && traza?.vehiculo !== tren.id
                          ? 'Cargando...'
                          : traza?.vehiculo === tren.id
                            ? 'Ocultar traza'
                            : 'Ver traza (24 h)'}
                      </Button>
                    </div>
                  </Popup>
                </CircleMarker>
              ))}
              {traza && traza.puntos.length > 1 && (
                <Polyline
                  positions={traza.puntos.map((p) => [p.latitud, p.longitud] as [number, number])}
                  pathOptions={{
                    color: '#0ea5e9',
                    weight: 3,
                    opacity: 0.8,
                    dashArray: '6 8',
                  }}
                />
              )}
            </MapContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
