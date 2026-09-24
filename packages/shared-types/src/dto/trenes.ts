import { z } from 'zod';

export const busquedaHorariosQuerySchema = z.object({
  origen: z.string().trim().min(2),
  destino: z.string().trim().min(2),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export type BusquedaHorariosQuery = z.infer<typeof busquedaHorariosQuerySchema>;

export interface HorarioTrenResponse {
  numeroTren: string;
  origenNombre: string;
  destinoNombre: string;
  salida: string;
  llegada: string;
  duracionMin: number;
  operador: string | null;
}

export interface PosicionTrenResponse {
  id: string;
  numeroTren: string | null;
  latitud: number;
  longitud: number;
  velocidadKmh: number | null;
  retrasoSeg: number | null;
  actualizadaEn: string;
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
