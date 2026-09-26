import { z } from 'zod';

export const busquedaHorariosQuerySchema = z.object({
  origen: z.string().trim().min(2),
  destino: z.string().trim().min(2),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

/**
 * Las horas GTFS se guardan como hora peninsular tratada como UTC: para
 * mostrarlas hay que leer el ISO directamente (sin convertir a la zona del
 * navegador, que añadiría1-2 horas).
 */
export function horaGtfs(iso: string | null | undefined): string {
  if (!iso) return '--:--';
  return iso.length >= 16 ? iso.slice(11, 16) : iso;
}

export type BusquedaHorariosQuery = z.infer<typeof busquedaHorariosQuerySchema>;

export interface TramoTransbordo {
  estacion: string;
  llegadaPrimera: string;
  salidaSegunda: string;
  esperaMin: number;
  trenPrimera: string;
  trenSegunda: string;
}

export interface HorarioTrenResponse {
  numeroTren: string;
  origenNombre: string;
  destinoNombre: string;
  salida: string;
  llegada: string;
  duracionMin: number;
  operador: string | null;
  /** Presente si el trayecto requiere un transbordo (sin tren directo) */
  transbordo?: TramoTransbordo;
}

export interface PosicionTrenResponse {
  id: string;
  numeroTren: string | null;
  latitud: number;
  longitud: number;
  velocidadKmh: number | null;
  retrasoSeg: number | null;
  actualizadaEn: string;
  /** Trip del feed GTFS-RT (match de trayecto para Cercanías) */
  tripId?: string | null;
  /** Trayecto actual del tren (cruzado con horarioTren) si se conoce */
  origenNombre?: string | null;
  destinoNombre?: string | null;
  salida?: string | null;
  llegada?: string | null;
  operador?: string | null;
}

export interface PuntoTraza {
  en: string;
  latitud: number;
  longitud: number;
  retrasoSeg: number | null;
}

export const criterioDisponibilidadSchema = z.object({
  origenNombre: z.string().min(2),
  destinoNombre: z.string().min(2),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  horaDesde: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .optional()
    .nullable(),
  horaHasta: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .optional()
    .nullable(),
  numeroTren: z.string().optional().nullable(),
});

export type ConsultaDisponibilidad = z.infer<typeof criterioDisponibilidadSchema>;

export interface EstadoTrenDisponible {
  trenId: string;
  numeroTren: string;
  salida: string;
  disponible: boolean;
  precioMin: number | null;
  moneda: string;
  retrasoSeg?: number | null;
}

export interface EstadoDisponibilidad {
  consulta: ConsultaDisponibilidad;
  trenes: EstadoTrenDisponible[];
  consultadoEn: string;
}

/** Ranking mensual de impuntualidad (servicios con retraso >= umbral) */
export interface PuntualidadTrenResponse {
  vehiculoId: string;
  numeroTren: string | null;
  /** Nº de servicios (trip+fecha) impuntuales en el mes */
  vecesImpuntuales: number;
  /** Media del retraso máximo de cada servicio, en segundos */
  retrasoMedioSeg: number;
  /** Peor retraso visto en el mes, en segundos */
  retrasoMaxSeg: number;
  /** Trayecto habitual entre sus servicios impuntuales */
  origenNombre?: string | null;
  destinoNombre?: string | null;
  /** Salida habitual del trayecto (hora peninsular HH:MM) */
  salida?: string | null;
  /** Fecha del servicio impuntual representativo (YYYY-MM-DD) */
  fecha?: string | null;
}
