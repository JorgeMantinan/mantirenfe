import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CircleDot, RefreshCw, Search } from 'lucide-react';
import type { PathOptions } from 'leaflet';
import { useLocation } from 'react-router-dom';
import { api } from '@/lib/api';
import { useRefresco } from '@/hooks/useRefresco';
import { locale } from '@/i18n';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  funcionIndemnizacion,
  horaGtfs,
  type EstacionResponse,
  type PosicionTrenResponse,
  type PuntoTraza,
} from '@mantirenfe/shared-types';

/** leaflet/react-leaflet entran por import dinámico (fuera del chunk raíz). */
type MapaLeaflet = typeof import('./mapa-leaflet');

// Tiles: por defecto Esri World Street (gratis, sin API key). Si quieres CARTO
// u otro proveedor, define VITE_TILES_URL (+ VITE_TILES_ATTRIBUTION) en Vercel.
const TILES_URL =
  (import.meta.env.VITE_TILES_URL as string | undefined) ??
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}';
const TILES_ATTRIBUTION =
  (import.meta.env.VITE_TILES_ATTRIBUTION as string | undefined) ??
  '© <a href="https://www.esri.com/">Esri</a>, HERE, NAVTEQ, OpenStreetMap, NGA, USGS, NPS, METI, Garmin, GIS Finland, and the GIS community';

const CENTRO_ESPANIA: [number, number] = [40.2, -3.7];

/** Zoom de la estación seleccionada desde /estaciones (?estacion=...). */
const ZOOM_ESTACION = 12;

/** Estilo de los marcadores y de la traza: constantes, no se recrean por render. */
const PATH_TREN: PathOptions = {
  color: '#75258c',
  fillColor: '#75258c',
  fillOpacity: 0.85,
  weight: 2,
};
const PATH_TRAZA: PathOptions = {
  color: '#111111',
  weight: 4,
  opacity: 0.8,
  dashArray: '6 8',
};
/** Marcador de la estación elegida: ámbar y radio mayor para distinguirlo de los trenes. */
const PATH_ESTACION: PathOptions = {
  color: '#f59e0b',
  fillColor: '#f59e0b',
  fillOpacity: 0.9,
  weight: 3,
};

/**
 * Altura del mapa (fuera de embebido): 480px, y más alto en pantallas con el
 * viewport por encima de 1000px de alto, donde sobra sitio en vertical.
 */
const ALTURA_MAPA = 'h-[480px] [@media(min-height:1000px)]:h-[640px]';

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

interface PopupProps {
  tren: PosicionTrenResponse;
  traza: { vehiculo: string; puntos: PuntoTraza[] } | null;
  cargandoTraza: boolean;
  trazaVisible: boolean;
  onAlternar: (vehiculo: string, tripId?: string | null) => void;
}

/**
 * Contenido del popup, memoizado: solo cambia si cambia el tren o la traza.
 * La traza se precarga al abrir el popup, así que aquí solo se decide si el
 * botón está cargando, si se puede mostrar u ocultar, o si no hay traza.
 */
const PopupTren = memo(function PopupTren({
  tren,
  traza,
  cargandoTraza,
  trazaVisible,
  onAlternar,
}: PopupProps) {
  const { t } = useTranslation();
  const indemnizacion = tren.retrasoSeg != null ? funcionIndemnizacion(tren.retrasoSeg) : null;
  const trazaEste = traza?.vehiculo === tren.id ? traza : null;
  const trazaDisponible = trazaEste !== null && trazaEste.puntos.length >= 2;
  const visible = trazaEste !== null && trazaVisible;

  return (
    <div className="space-y-1 text-sm">
      <strong>
        {tren.numeroTren ?? t('mapa.tren')}
        {tren.operador ? ` · ${tren.operador}` : ''}
      </strong>
      {tren.origenNombre && tren.destinoNombre && (
        <p className="font-medium">
          {tren.origenNombre} → {tren.destinoNombre}
        </p>
      )}
      {tren.salida && (
        <p>
          {t('mapa.salida', { hora: horaGtfs(tren.salida) })}
          {tren.llegada ? t('mapa.llegada', { hora: horaGtfs(tren.llegada) }) : ''}
        </p>
      )}
      {tren.cancelado && <p className="font-semibold text-red-600">{t('estados.cancelado')}</p>}
      {tren.velocidadKmh != null && <p>{tren.velocidadKmh} km/h</p>}
      {tren.retrasoSeg != null && (
        <p className={tren.retrasoSeg >= 300 ? 'font-semibold text-red-600' : ''}>
          {tren.retrasoSeg > 0
            ? t('estados.retraso', { min: Math.round(tren.retrasoSeg / 60) })
            : t('estados.aTiempo')}
        </p>
      )}
      {indemnizacion && (
        <p className="font-semibold text-red-600">
          {t('mapa.compromiso', { texto: indemnizacion.descripcion })}
        </p>
      )}
      <p className="text-xs text-gray-500">
        {t('mapa.actualizado', {
          hora: new Date(tren.actualizadaEn).toLocaleTimeString(locale()),
        })}
      </p>
      {cargandoTraza && trazaEste === null ? (
        <Button variant="outline" size="sm" disabled>
          {t('mapa.cargando')}
        </Button>
      ) : trazaDisponible ? (
        <Button variant="outline" size="sm" onClick={() => onAlternar(tren.id, tren.tripId)}>
          {visible ? t('mapa.ocultarTraza') : t('mapa.verTraza')}
        </Button>
      ) : (
        <p className="text-xs text-muted-foreground">{t('mapa.trazaNoDisponible')}</p>
      )}
    </div>
  );
});

export function PaginaMapa() {
  const { t } = useTranslation();
  // Dentro de la APK (?app=1) el mapa ocupa casi toda la pantalla
  const { search } = useLocation();
  const embebido = new URLSearchParams(search).get('app') === '1';
  const [trenes, setTrenes] = useState<PosicionTrenResponse[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [traza, setTraza] = useState<{ vehiculo: string; puntos: PuntoTraza[] } | null>(null);
  const [trazaVisible, setTrazaVisible] = useState(false);
  const [cargandoTraza, setCargandoTraza] = useState(false);
  const [filtro, setFiltro] = useState('');
  const [leaflet, setLeaflet] = useState<MapaLeaflet | null>(null);

  // ?estacion=Nombre&lat=..&lng=..: llega desde /estaciones y se lee una sola
  // vez, al montar; sin coords buscaremos la estación por nombre más abajo.
  const [entrada] = useState(() => {
    const params = new URLSearchParams(search);
    const nombre = params.get('estacion')?.trim() || null;
    const lat = params.get('lat');
    const lng = params.get('lng');
    const latNum = lat === null ? NaN : Number(lat);
    const lngNum = lng === null ? NaN : Number(lng);
    const conCoords = Number.isFinite(latNum) && Number.isFinite(lngNum);
    return {
      nombre,
      coords: nombre !== null && conCoords ? ([latNum, lngNum] as [number, number]) : null,
    };
  });
  const [centroEstacion, setCentroEstacion] = useState<[number, number] | null>(entrada.coords);

  // leaflet se carga una sola vez, al entrar en la página
  useEffect(() => {
    let cancelado = false;
    void import('./mapa-leaflet')
      .then((modulo) => {
        if (!cancelado) setLeaflet(modulo);
      })
      .catch(() => undefined);
    return () => {
      cancelado = true;
    };
  }, []);

  // Sin coords en la URL buscamos la estación por nombre: una única petición
  // al montar (el endpoint admite `q` y devuelve la mejor coincidencia).
  useEffect(() => {
    if (entrada.nombre === null || entrada.coords !== null) return;
    let cancelado = false;
    api<EstacionResponse[]>(`/estaciones?q=${encodeURIComponent(entrada.nombre)}&limite=1`)
      .then((r) => {
        const estacion = r[0];
        if (cancelado || !estacion || estacion.latitud == null || estacion.longitud == null) {
          return;
        }
        setCentroEstacion([estacion.latitud, estacion.longitud]);
      })
      .catch(() => {
        // Sin coords nos quedamos en la vista general: el mapa sigue siendo útil
      });
    return () => {
      cancelado = true;
    };
  }, [entrada]);

  // Única petición de traza viva: si cambia el popup (u otra llega antes),
  // la anterior se aborta y su respuesta se descarta.
  const peticionTraza = useRef<{ vehiculo: string; control: AbortController } | null>(null);
  useEffect(
    () => () => {
      peticionTraza.current?.control.abort();
    },
    [],
  );

  /**
   * Descarga la traza de un vehículo y la deja en caché. `mostrar` decide si
   * se pinta la polilínea al llegar; si ya está en caché no se vuelve a pedir.
   */
  const cargarTraza = useCallback(
    (vehiculo: string, tripId: string | null | undefined, mostrar: boolean) => {
      if (traza?.vehiculo === vehiculo) {
        if (mostrar) setTrazaVisible(true);
        return;
      }
      if (peticionTraza.current?.vehiculo === vehiculo) return; // ya está en vuelo
      peticionTraza.current?.control.abort();
      const control = new AbortController();
      peticionTraza.current = { vehiculo, control };
      setCargandoTraza(true);
      api<{ vehiculo: string; puntos: PuntoTraza[] }>(
        `/trenes/posiciones/traza?vehiculo=${encodeURIComponent(vehiculo)}&horas=24${
          tripId ? `&tripId=${encodeURIComponent(tripId)}` : ''
        }`,
        { signal: control.signal },
      )
        .then((datos) => {
          if (peticionTraza.current?.control !== control) return;
          setTraza(datos);
          setTrazaVisible(mostrar);
        })
        .catch(() => {
          // popup efímero: no bloquear el mapa por un error de la traza
        })
        .finally(() => {
          if (peticionTraza.current?.control === control) {
            peticionTraza.current = null;
            setCargandoTraza(false);
          }
        });
    },
    [traza?.vehiculo],
  );

  /** Al abrir el popup se precarga; el botón solo alterna mostrar/ocultar. */
  const alternarTraza = useCallback(
    (vehiculo: string, tripId?: string | null) => {
      if (traza?.vehiculo === vehiculo && trazaVisible) {
        setTrazaVisible(false);
        return;
      }
      cargarTraza(vehiculo, tripId, true);
    },
    [cargarTraza, traza?.vehiculo, trazaVisible],
  );

  // La primera carga enseña el esqueleto; las siguientes son silenciosas.
  // El refresco (30 s) se pausa con la pestaña oculta y salta al volver.
  const primeraCarga = useRef(true);
  const refrescar = useCallback(
    (mostrarCarga: boolean) => {
      if (mostrarCarga) setCargando(true);
      api<{ trenes: PosicionTrenResponse[] }>('/trenes/posiciones')
        .then((d) => {
          setTrenes(d.trenes);
          setError(null);
        })
        .catch((e: unknown) => {
          setError(e instanceof Error && e.message ? e.message : t('mapa.errorCarga'));
        })
        .finally(() => {
          if (mostrarCarga) setCargando(false);
        });
    },
    [t],
  );
  useRefresco(() => {
    const mostrar = primeraCarga.current;
    primeraCarga.current = false;
    refrescar(mostrar);
  }, 30_000);

  // ¿Cuánto falta la última posición conocida? Si el feed de Renfe se para,
  // el mapa se queda «congelado» y parece que no circulan trenes.
  const desfaseMin = useMemo(() => {
    if (!trenes || trenes.length === 0) return 0;
    const ultima = Math.max(...trenes.map((t) => new Date(t.actualizadaEn).getTime()));
    if (!Number.isFinite(ultima)) return 0;
    return Math.max(0, Math.floor((Date.now() - ultima) / 60_000));
  }, [trenes]);

  const q = filtro.trim().toLowerCase();
  const visibles = useMemo(() => {
    const lista = trenes ?? [];
    if (!q) return lista;
    return lista.filter(
      (t) =>
        (t.numeroTren ?? '').toLowerCase().includes(q) ||
        (t.origenNombre ?? '').toLowerCase().includes(q) ||
        (t.destinoNombre ?? '').toLowerCase().includes(q) ||
        t.id.toLowerCase().includes(q),
    );
  }, [trenes, q]);

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-heading text-3xl font-bold tracking-tight">{t('mapa.titulo')}</h1>
            {entrada.nombre !== null && (
              <Badge variant="outline" className="border-primary text-primary">
                {t('mapa.estacionSeleccionada', { nombre: entrada.nombre })}
              </Badge>
            )}
          </div>
          <p className="text-muted-foreground">{t('mapa.subtitulo')}</p>
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
              placeholder={t('mapa.placeholder')}
              className="w-48 pl-8"
              aria-label={t('mapa.filtrarAria')}
            />
          </div>
          <span className="text-sm text-muted-foreground">
            {trenes
              ? q
                ? t('mapa.recuentoFiltrado', { visibles: visibles.length, total: trenes.length })
                : t('mapa.recuento', { total: trenes.length })
              : '—'}
          </span>
          <Button variant="outline" size="sm" onClick={() => refrescar(true)} disabled={cargando}>
            <RefreshCw className={cargando ? 'animate-spin' : ''} aria-hidden="true" />{' '}
            {t('mapa.actualizar')}
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
          {error}
          {t('mapa.errorApiAntes')}
          <code>.env</code>
          {t('mapa.errorApiDespues')}
        </div>
      )}

      {desfaseMin >= 5 && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
          {t('mapa.feedLento', { min: desfaseMin })}
        </div>
      )}

      {trenes !== null && q && visibles.length === 0 && (
        <p className="text-sm text-muted-foreground">{t('mapa.sinCoincidencias', { filtro })}</p>
      )}

      <Card className="overflow-hidden">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-lg">
            <CircleDot className="h-4 w-4 text-primary" aria-hidden="true" /> {t('mapa.redTitulo')}
          </CardTitle>
          <CardDescription>{t('mapa.redDatos')}</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {cargando && trenes === null ? (
            <Skeleton className={`${ALTURA_MAPA} w-full rounded-none`} />
          ) : leaflet === null ? (
            // Mientras baja el chunk de leaflet
            <Skeleton className={`${ALTURA_MAPA} w-full rounded-none`} />
          ) : (
            <leaflet.MapContainer
              center={CENTRO_ESPANIA}
              zoom={6}
              className={embebido ? 'h-[calc(100vh-15rem)] min-h-[320px] w-full' : ALTURA_MAPA}
              scrollWheelZoom
            >
              <leaflet.TileLayer attribution={TILES_ATTRIBUTION} url={TILES_URL} />
              <leaflet.Actualizador posiciones={trenes ?? []} />
              {centroEstacion && <leaflet.Centrador center={centroEstacion} zoom={ZOOM_ESTACION} />}
              {visibles.map((tren) => (
                <leaflet.CircleMarker
                  key={tren.id}
                  center={[tren.latitud, tren.longitud]}
                  radius={7}
                  pathOptions={PATH_TREN}
                  eventHandlers={{
                    // Al abrir el popup se precarga su traza (una sola petición)
                    popupopen: () => cargarTraza(tren.id, tren.tripId, false),
                  }}
                >
                  <leaflet.Popup>
                    <PopupTren
                      tren={tren}
                      traza={traza}
                      cargandoTraza={cargandoTraza}
                      trazaVisible={trazaVisible}
                      onAlternar={alternarTraza}
                    />
                  </leaflet.Popup>
                </leaflet.CircleMarker>
              ))}
              {entrada.nombre !== null && centroEstacion && (
                <leaflet.CircleMarker
                  center={centroEstacion}
                  radius={9}
                  pathOptions={PATH_ESTACION}
                >
                  <leaflet.Popup>
                    {t('mapa.estacionSeleccionada', { nombre: entrada.nombre })}
                  </leaflet.Popup>
                </leaflet.CircleMarker>
              )}
              {trazaVisible &&
                traza &&
                visibles.some((v) => v.id === traza.vehiculo) &&
                segmentarPorHuecos(traza.puntos).map((segmento, i) =>
                  segmento.length > 1 ? (
                    <leaflet.Polyline
                      key={i}
                      positions={segmento.map((p) => [p.latitud, p.longitud] as [number, number])}
                      pathOptions={PATH_TRAZA}
                    />
                  ) : null,
                )}
            </leaflet.MapContainer>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">{t('mapa.pie')}</p>
    </div>
  );
}
