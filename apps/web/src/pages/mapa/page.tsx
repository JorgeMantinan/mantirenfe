import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CircleDot, RefreshCw, Search } from 'lucide-react';
import type { PathOptions } from 'leaflet';
import { useLocation } from 'react-router-dom';
import { api } from '@/lib/api';
import { useRefresco } from '@/hooks/useRefresco';
import { locale } from '@/i18n';
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

/** Estilo de los marcadores y de la traza: constantes, no se recrean por render. */
const PATH_TREN: PathOptions = {
  color: '#75258c',
  fillColor: '#75258c',
  fillOpacity: 0.85,
  weight: 2,
};
const PATH_TRAZA: PathOptions = {
  color: '#0ea5e9',
  weight: 3,
  opacity: 0.8,
  dashArray: '6 8',
};

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
  onAlternar: (vehiculo: string, tripId?: string | null) => void;
}

/** Contenido del popup, memoizado: solo cambia si cambia el tren o la traza. */
const PopupTren = memo(function PopupTren({ tren, traza, cargandoTraza, onAlternar }: PopupProps) {
  const { t } = useTranslation();
  const indemnizacion = tren.retrasoSeg != null ? funcionIndemnizacion(tren.retrasoSeg) : null;

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
      <Button
        variant="outline"
        size="sm"
        disabled={cargandoTraza}
        onClick={() => onAlternar(tren.id, tren.tripId)}
      >
        {cargandoTraza && traza?.vehiculo !== tren.id
          ? t('mapa.cargando')
          : traza?.vehiculo === tren.id
            ? t('mapa.ocultarTraza')
            : t('mapa.verTraza')}
      </Button>
      {traza?.vehiculo === tren.id && traza.puntos.length <= 1 && (
        <p className="text-xs text-amber-600">{t('mapa.soloPunto')}</p>
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
  const [cargandoTraza, setCargandoTraza] = useState(false);
  const [filtro, setFiltro] = useState('');
  const [leaflet, setLeaflet] = useState<MapaLeaflet | null>(null);

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
          <h1 className="font-heading text-3xl font-bold tracking-tight">{t('mapa.titulo')}</h1>
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
            <Skeleton className="h-[480px] w-full rounded-none" />
          ) : leaflet === null ? (
            // Mientras baja el chunk de leaflet
            <Skeleton className="h-[480px] w-full rounded-none" />
          ) : (
            <leaflet.MapContainer
              center={CENTRO_ESPANIA}
              zoom={6}
              className={
                embebido ? 'h-[calc(100vh-15rem)] min-h-[320px] w-full' : 'h-[480px] w-full'
              }
              scrollWheelZoom
            >
              <leaflet.TileLayer attribution={TILES_ATTRIBUTION} url={TILES_URL} />
              <leaflet.Actualizador posiciones={trenes ?? []} />
              {visibles.map((tren) => (
                <leaflet.CircleMarker
                  key={tren.id}
                  center={[tren.latitud, tren.longitud]}
                  radius={7}
                  pathOptions={PATH_TREN}
                >
                  <leaflet.Popup>
                    <PopupTren
                      tren={tren}
                      traza={traza}
                      cargandoTraza={cargandoTraza}
                      onAlternar={alternarTraza}
                    />
                  </leaflet.Popup>
                </leaflet.CircleMarker>
              ))}
              {traza &&
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
