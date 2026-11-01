import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useTheme } from 'next-themes';
import { CircleDot, RefreshCw, Search } from 'lucide-react';
import type { PathOptions } from 'leaflet';
import { useLocation } from 'react-router-dom';
import { api } from '@/lib/api';
import { useRefresco } from '@/hooks/useRefresco';
import { useMetaPagina } from '@/hooks/useMetaPagina';
import { locale } from '@/i18n';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import {
  funcionIndemnizacion,
  horaGtfs,
  type EstacionResponse,
  type PosicionTrenResponse,
  type PuntoTraza,
} from '@mantirenfe/shared-types';

/** leaflet/react-leaflet entran por import dinámico (fuera del chunk raíz). */
type MapaLeaflet = typeof import('./mapa-leaflet');

// Tiles minimalistas (gris claro / gris oscuro) de Esri, sin API key y con
// atribución obligatoria; se eligen según el tema de la web.
//
// OJO: CARTO (Positron/Dark Matter) pasó a exigir API key: sin ella devuelve
// una imagen de 256×256 con el texto «API KEY REQUIRED», que es lo que rompió
// el mapa. Si quieres CARTO, coge una clave gratuita y define VITE_TILES_URL
// (+ VITE_TILES_ATTRIBUTION) en Vercel, que tiene prioridad.
const ATRIBUTION_ESRI =
  '© <a href="https://www.esri.com/">Esri</a>, HERE, Garmin, © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
const TILES = {
  claro: {
    url: 'https://services.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}',
    attribution: ATRIBUTION_ESRI,
  },
  oscuro: {
    url: 'https://services.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
    attribution: ATRIBUTION_ESRI,
  },
} as const;

const CENTRO_ESPANIA: [number, number] = [40.2, -3.7];

/** Zoom de la estación seleccionada desde /estaciones (?estacion=...). */
const ZOOM_ESTACION = 12;

/**
 * Estilo de los marcadores: punto morado pequeño con halo blanco. El halo es
 * lo que hace que el punto se vea sobre el lienzo gris (tema claro) y sobre
 * el gris oscuro (tema oscuro).
 */
const PATH_TREN: PathOptions = {
  color: '#ffffff',
  weight: 1.5,
  fillColor: '#75258c',
  fillOpacity: 1,
};

/**
 * Color de las trazas (la de la BD y la del navegador comparten tono para que
 * se lean como «el camino del tren»). El negro sobre el gris plano del mapa y
 * junto a los puntos morados se perdía: verde azulado oscuro en tema claro y
 * off-white #F5F5F4 (nunca blanco puro, que se funde con el gris) en oscuro.
 */
const TRAZA_TEMA = { claro: '#0f766e', oscuro: '#f5f5f4' } as const;
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

/* ------------------------------------------------------------------ */
/* Recorrido visto en el navegador.                                    */
/*                                                                     */
/* La traza de la BD (`/trenes/posiciones/traza`) se escribe poquísimas */
/* veces al día, así que la mayoría de trenes no tienen ninguna. En     */
/* cambio las posiciones en vivo llegan cada 30 s: se acumulan aquí, en */
/* memoria + sessionStorage, para poder dibujar por dónde ha pasado el  */
/* tren mientras el mapa ha estado abierto. No escribe nada en la BD ni */
/* mantiene despierto a nadie.                                          */
/* ------------------------------------------------------------------ */

type PuntoVisto = [number, number];
type Recorrido = { puntos: PuntoVisto[]; visto: number };
/** Map en vez de objeto: además de más rápido, no dispara el aviso de
 *  `security/detect-object-injection` (clave dinámica sobre objeto plano). */
type Recorridos = Map<string, Recorrido>;

const CLAVE_RECORRIDO = 'mantirenfe:mapa:recorrido';
/** 30 s por punto × 120 = una hora de recorrido por vehículo. */
const MAX_PUNTOS_POR_VEHICULO = 120;
/** Nada de «movimientos» de milímetros: ~11 m de margen. */
const EPSILON_GRADOS = 0.0001;
const VIDA_RECORRIDO_MS = 6 * 60 * 60_000;
const MAX_VEHICULOS = 120;

function leerRecorridos(): Recorridos {
  try {
    const bruto = sessionStorage.getItem(CLAVE_RECORRIDO);
    if (!bruto) return new Map();
    const datos = JSON.parse(bruto) as Record<string, Recorrido>;
    return typeof datos === 'object' && datos !== null ? new Map(Object.entries(datos)) : new Map();
  } catch {
    // sessionStorage bloqueado o dato corrupto: se empieza de cero
    return new Map();
  }
}

function guardarRecorridos(recorridos: Recorridos): void {
  try {
    sessionStorage.setItem(CLAVE_RECORRIDO, JSON.stringify(Object.fromEntries(recorridos)));
  } catch {
    // Lleno o bloqueado: el recorrido sigue en memoria, que es lo que importa
  }
}

/** Añade la posición actual de cada tren y poda lo antiguo. (Exportado para el test.) */
export function incorporarPuntos(prev: Recorridos, trenes: PosicionTrenResponse[]): Recorridos {
  const ahora = Date.now();
  const siguiente: Recorridos = new Map();
  for (const [vehiculo, recorrido] of prev) {
    if (ahora - recorrido.visto <= VIDA_RECORRIDO_MS) siguiente.set(vehiculo, recorrido);
  }
  for (const tren of trenes) {
    const previo = siguiente.get(tren.id);
    const puntos = previo?.puntos ?? [];
    const ultimo = puntos[puntos.length - 1];
    if (
      ultimo &&
      Math.abs(ultimo[0] - tren.latitud) < EPSILON_GRADOS &&
      Math.abs(ultimo[1] - tren.longitud) < EPSILON_GRADOS
    ) {
      siguiente.set(tren.id, { puntos, visto: ahora });
      continue;
    }
    siguiente.set(tren.id, {
      puntos: [...puntos, [tren.latitud, tren.longitud] as PuntoVisto].slice(
        -MAX_PUNTOS_POR_VEHICULO,
      ),
      visto: ahora,
    });
  }
  if (siguiente.size > MAX_VEHICULOS) {
    // Si hay más vehículos de los que queremos recordar, nos quedamos con los
    // vistos hace menos (los que el usuario está mirando, en la práctica)
    const orden = [...siguiente.entries()]
      .sort((a, b) => b[1].visto - a[1].visto)
      .map(([id]) => id);
    for (const id of orden.slice(MAX_VEHICULOS)) siguiente.delete(id);
  }
  return siguiente;
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
  useMetaPagina('/mapa');
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

  // Recorrido visto en el navegador (no en la BD): ver `incorporarPuntos`
  const [recorridos, setRecorridos] = useState<Recorridos>(leerRecorridos);
  const [mostrarRecorrido, setMostrarRecorrido] = useState(true);
  useEffect(() => {
    guardarRecorridos(recorridos);
  }, [recorridos]);

  // Tiles según el tema (CARTO Positron / Dark Matter). VITE_TILES_URL manda
  // si está definida, como hasta ahora.
  const { resolvedTheme } = useTheme();
  const tiles = useMemo(() => {
    const propio = import.meta.env.VITE_TILES_URL as string | undefined;
    if (propio) {
      return {
        url: propio,
        attribution:
          (import.meta.env.VITE_TILES_ATTRIBUTION as string | undefined) ?? TILES.claro.attribution,
      };
    }
    return resolvedTheme === 'dark' ? TILES.oscuro : TILES.claro;
  }, [resolvedTheme]);

  // Trazas con el mismo tono en los dos estilos: verde azulado sobre el gris
  // claro y off-white sobre el gris oscuro (ver TRAZA_TEMA).
  const trazas = useMemo(() => {
    const color = resolvedTheme === 'dark' ? TRAZA_TEMA.oscuro : TRAZA_TEMA.claro;
    return {
      bd: { color, weight: 3, opacity: 0.9, dashArray: '6 8' } as PathOptions,
      navegador: { color, weight: 3, opacity: 0.85 } as PathOptions,
    };
  }, [resolvedTheme]);

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
          // Cada refresco aporta un punto por tren al recorrido visto
          setRecorridos((prev) => incorporarPuntos(prev, d.trenes));
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
        <div className="flex flex-wrap items-center justify-end gap-2">
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
          <div className="flex items-center gap-2" title={t('mapa.recorridoPista')}>
            <Switch
              id="recorrido"
              checked={mostrarRecorrido}
              onCheckedChange={setMostrarRecorrido}
            />
            <Label htmlFor="recorrido" className="cursor-pointer text-sm text-muted-foreground">
              {t('mapa.recorrido')}
            </Label>
          </div>
          {recorridos.size > 0 && (
            <Button variant="ghost" size="sm" onClick={() => setRecorridos(new Map())}>
              {t('mapa.recorridoBorrar')}
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => refrescar(true)} disabled={cargando}>
            <RefreshCw className={cargando ? 'animate-spin' : ''} aria-hidden="true" />{' '}
            {t('mapa.actualizar')}
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
          {error}
          {/* Pista de despliegue («revisa la URL de GTFS-RT en .env»): es para
              quien mantiene el proyecto, no para quien se queda sin conexión.
              Solo en desarrollo; en producción el usuario ve solo lo de arriba. */}
          {import.meta.env.DEV && (
            <span className="mt-1 block text-xs opacity-75">
              {t('mapa.errorApiAntes')}
              <code>.env</code>
              {t('mapa.errorApiDespues')}
            </span>
          )}
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
              <leaflet.TileLayer attribution={tiles.attribution} url={tiles.url} />
              <leaflet.Actualizador posiciones={trenes ?? []} />
              {centroEstacion && <leaflet.Centrador center={centroEstacion} zoom={ZOOM_ESTACION} />}
              {visibles.map((tren) => (
                <leaflet.CircleMarker
                  key={tren.id}
                  center={[tren.latitud, tren.longitud]}
                  radius={4}
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
              {/* Recorrido visto en el navegador: se acumula con cada refresco
                  (30 s) y sobrevive a recargas de la pestaña. */}
              {mostrarRecorrido &&
                visibles.map((tren) => {
                  const puntos = recorridos.get(tren.id)?.puntos;
                  if (!puntos || puntos.length < 2) return null;
                  return (
                    <leaflet.Polyline
                      key={`recorrido-${tren.id}`}
                      positions={puntos}
                      pathOptions={trazas.navegador}
                    />
                  );
                })}
              {trazaVisible &&
                traza &&
                visibles.some((v) => v.id === traza.vehiculo) &&
                segmentarPorHuecos(traza.puntos).map((segmento, i) =>
                  segmento.length > 1 ? (
                    <leaflet.Polyline
                      key={i}
                      positions={segmento.map((p) => [p.latitud, p.longitud] as [number, number])}
                      pathOptions={trazas.bd}
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
