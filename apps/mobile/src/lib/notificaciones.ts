/**
 * Destino del tap de una notificación push, SIEMPRE dentro de la app.
 *
 * El worker (apps/worker) manda en `data`:
 * - `alertaId` + `url: '/alertas/<id>'` en los avisos de sondeo (disponibilidad,
 *   precio, recordatorios, incidencias…);
 * - `url: '/notificaciones'` en el resumen semanal y el digest diario, que son
 *   rutas SOLO de `apps/web` (no existen en `src/app` del móvil);
 * - `tipo` cuando no hay alerta detrás (p. ej. 'incidencia', que el móvil no
 *   tiene pantalla propia).
 *
 * Nunca se devuelve una URL externa: el navegador no se abre desde un push.
 */
export type DestinoNotificacion =
  { clase: 'alerta'; alertaId: string } | { clase: 'ruta'; ruta: string } | null;

/** Rutas que existen en `apps/mobile/src/app`. */
const RUTAS_MOVIL = ['/', '/avisos', '/trenes', '/ajustes', '/alertas/nueva'];

/** Quita origen, query y hash: "https://x/y?z" → "/y", "/avisos?n=1" → "/avisos". */
function rutaInterna(url: string): string {
  const sinOrigen = url.replace(/^[a-z][\w+.-]*:\/\/[^/]+/i, '');
  return sinOrigen.split(/[?#]/)[0] ?? '';
}

/** `null` si no hay nada que abrir (notificación sin datos que llevar a una pantalla). */
export function destinoDeNotificacion(datos: unknown): DestinoNotificacion {
  const d = (datos ?? {}) as Record<string, unknown>;

  const alertaId = typeof d.alertaId === 'string' ? d.alertaId.trim() : '';
  if (alertaId) return { clase: 'alerta', alertaId };

  const ruta = rutaInterna(typeof d.url === 'string' ? d.url : '');
  if (ruta.startsWith('/alertas/')) {
    const id = decodeURIComponent(ruta.slice('/alertas/'.length));
    if (id) return { clase: 'alerta', alertaId: id };
  }
  if (RUTAS_MOVIL.includes(ruta)) return { clase: 'ruta', ruta };

  // '/notificaciones', '/puntualidad', una URL absoluta… o cualquier `tipo`
  // sin alerta: al centro de avisos del móvil.
  if (ruta || typeof d.tipo === 'string') return { clase: 'ruta', ruta: '/avisos' };
  return null;
}
