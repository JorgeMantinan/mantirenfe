import { useEffect } from 'react';
import 'leaflet/dist/leaflet.css';
import { useMap } from 'react-leaflet';
import type { PosicionTrenResponse } from '@mantirenfe/shared-types';

/**
 * Módulo «caro» del mapa: leaflet + react-leaflet solo se descargan cuando
 * el usuario entra en /mapa (import dinámico en la página), así el bundle
 * raíz no se lleva los ~150 kB de leaflet.
 */
export { CircleMarker, MapContainer, Polyline, Popup, TileLayer, useMap } from 'react-leaflet';

/** Vuelve a medir el mapa cuando llegan posiciones (puede estar oculto al montar). */
export function Actualizador({ posiciones }: { posiciones: PosicionTrenResponse[] }) {
  const map = useMap();
  useEffect(() => {
    if (posiciones.length > 0) {
      map.invalidateSize();
    }
  }, [map, posiciones.length]);
  return null;
}
