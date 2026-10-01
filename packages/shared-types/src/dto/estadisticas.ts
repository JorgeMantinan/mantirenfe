/**
 * Ventana de "Tu actividad" (GET /estadisticas): avisos de los últimos 30 días.
 * Las alertas, en cambio, se cuentan todas (no caducan por fecha).
 */
export const PERIODO_ESTADISTICAS_DIAS = 30;

/**
 * Clave de agrupación de los avisos sin `datos.tipo` (disponibilidad, horario y
 * retraso: los que escribe el sondeo sin marca). Compartida por la API (que
 * agrupa en SQL) y por las UI (que traducen la etiqueta).
 */
export const TIPO_AVISO_SIN_TIPO = 'alertas';

/**
 * Resumen de "Tu actividad" (GET /estadisticas): cuántos avisos ha recibido el
 * usuario en la ventana y de qué tipos, más el estado de sus alertas.
 */
export interface EstadisticasResponse {
  /** Días de ventana de `avisos` (siempre `PERIODO_ESTADISTICAS_DIAS`). */
  periodoDias: number;
  avisos: {
    /** Total de avisos creados en la ventana. */
    total: number;
    /**
     * Recuento por `datos ->> 'tipo'` (p. ej. `cancelacion`, `precio`,
     * `digest-email`); los avisos sin tipo van agrupados como `alertas`.
     */
    porTipo: Record<string, number>;
  };
  alertas: {
    total: number;
    activas: number;
    pausa: number;
    completadas: number;
  };
}
