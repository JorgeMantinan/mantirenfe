import { useCallback, useEffect, useState } from 'react';
import { CircleDot, RefreshCw, Search } from 'lucide-react';
import { MapContainer, TileLayer, CircleMarker, Popup, Polyline, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  funcionIndemnizacion,
  horaGtfs,
  type PosicionTrenResponse,
  type PuntoTraza,
} from '@mantirenfe/shared-types';

// Tiles: por defecto Esri World Street (gratis, sin API key). Si quieres CARTO
// u otro proveedor, define VITE_TILES_URL (+ VITE_TILES_ATTRIBUTION) en Vercel.
const TILES_URL =
  (import.meta.env.VITE_TILES_URL as string | undefined) ??
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}';
const TILES_ATTRIBUTION =
  (import.meta.env.VITE_TILES_ATTRIBUTION as string | undefined) ??
  '© <a href="https://www.esri.com/">Esri</a>, HERE, NAVTEQ, OpenStreetMap, NGA, USGS, NPS, METI, Garmin, GIS Finland, and the GIS community';

const CENTRO_ESPANIA: [number, number] = [40.2, -3.7];

/** Parte la traza en segmentos si entre puntos hay más de maxMin de diferencia
 * (evita rectas fantasma cuando el tren lleva parado/aparcado o cambió de servicio). */
function segmentarPorHuecos(puntos: PuntoTraza[], maxMin = 30): PuntoTraza[][] {
  const segmentos: PuntoTraza[][] = [];
  let actual: PuntoTraza[] = [];
  for (const p of puntos) {
    const previo = actual[actual.length - 1];
    if (previo && (new Date(p.en).getTime() - new Date(previo.en).getTime()) / 60_000 > maxMin) {
      segmentos.push(actual);
      actual = [];
    }
    actual.push(p);
  }
  if (actual.length > 0) segmentos.push(actual);
  return segmentos;
}

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
  const [filtro, setFiltro] = useState('');

  const alternarTraza = useCallback(
    async (vehiculo: string, tripId?: string | null) => {
      if (traza?.vehiculo === vehiculo) {
        setTraza(null);
        return;
      }
      setCargandoTraza(true);
      try {
        const datos = await api<{ vehiculo: string; puntos: PuntoTraza[] }>(
          `/trenes/posiciones/traza?vehiculo=${encodeURIComponent(vehiculo)}&horas=24${
            tripId ? `&tripId=${encodeURIComponent(tripId)}` : ''
          }`,
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

  const q = filtro.trim().toLowerCase();
  const visibles = (trenes ?? []).filter(
    (t) =>
      !q ||
      (t.numeroTren ?? '').toLowerCase().includes(q) ||
      (t.origenNombre ?? '').toLowerCase().includes(q) ||
      (t.destinoNombre ?? '').toLowerCase().includes(q) ||
      t.id.toLowerCase().includes(q),
  );

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
          <div className="relative">
            <Search
              className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              value={filtro}
              onChange={(e) => setFiltro(e.target.value)}
              placeholder="Filtrar trenes..."
              className="w-48 pl-8"
              aria-label="Filtrar trenes del mapa"
            />
          </div>
          <span className="text-sm text-muted-foreground">
            {trenes
              ? q
                ? `${visibles.length} / ${trenes.length} trenes`
                : `${trenes.length} trenes`
              : '—'}
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

      {trenes !== null && q && visibles.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Ningún tren coincide con «{filtro}». Borra el filtro para verlos todos.
        </p>
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
              <TileLayer attribution={TILES_ATTRIBUTION} url={TILES_URL} />
              <Actualizador posiciones={trenes ?? []} />
              {visibles.map((tren) => {
                const indemnizacion =
                  tren.retrasoSeg != null ? funcionIndemnizacion(tren.retrasoSeg) : null;
                return (
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
                        <strong>
                          {tren.numeroTren ?? 'Tren'}
                          {tren.operador ? ` · ${tren.operador}` : ''}
                        </strong>
                        {tren.origenNombre && tren.destinoNombre && (
                          <p className="font-medium">
                            {tren.origenNombre} → {tren.destinoNombre}
                          </p>
                        )}
                        {tren.salida && (
                          <p>
                            Salida {horaGtfs(tren.salida)}
                            {tren.llegada ? ` · Llegada ${horaGtfs(tren.llegada)}` : ''}
                          </p>
                        )}
                        {tren.velocidadKmh != null && <p>{tren.velocidadKmh} km/h</p>}
                        {tren.retrasoSeg != null && (
                          <p className={tren.retrasoSeg >= 300 ? 'font-semibold text-red-600' : ''}>
                            {tren.retrasoSeg > 0
                              ? `Retraso +${Math.round(tren.retrasoSeg / 60)} min`
                              : 'A tiempo'}
                          </p>
                        )}
                        {indemnizacion && (
                          <p className="font-semibold text-red-600">
                            Compromiso de Renfe: {indemnizacion.descripcion}
                          </p>
                        )}
                        <p className="text-xs text-gray-500">
                          Actualizado {new Date(tren.actualizadaEn).toLocaleTimeString('es-ES')}
                        </p>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={cargandoTraza}
                          onClick={() => void alternarTraza(tren.id, tren.tripId)}
                        >
                          {cargandoTraza && traza?.vehiculo !== tren.id
                            ? 'Cargando...'
                            : traza?.vehiculo === tren.id
                              ? 'Ocultar traza'
                              : 'Ver traza (24 h)'}
                        </Button>
                        {traza?.vehiculo === tren.id && traza.puntos.length <= 1 && (
                          <p className="text-xs text-amber-600">
                            Solo 1 punto registrado (muestreo cada 10 min) — vuelve a pulsar en un
                            rato.
                          </p>
                        )}
                      </div>
                    </Popup>
                  </CircleMarker>
                );
              })}
              {traza &&
                visibles.some((v) => v.id === traza.vehiculo) &&
                segmentarPorHuecos(traza.puntos).map((segmento, i) =>
                  segmento.length > 1 ? (
                    <Polyline
                      key={i}
                      positions={segmento.map((p) => [p.latitud, p.longitud] as [number, number])}
                      pathOptions={{
                        color: '#0ea5e9',
                        weight: 3,
                        opacity: 0.8,
                        dashArray: '6 8',
                      }}
                    />
                  ) : null,
                )}
            </MapContainer>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Compromiso de Puntualidad de Renfe (fuente: renfe.com, consulta 27/09/2026) · solo
        informativo: el porcentaje de devolución real depende del tipo de servicio y de las
        exclusiones aplicables.
      </p>
    </div>
  );
}
