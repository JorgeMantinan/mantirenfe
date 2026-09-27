import { z } from 'zod';
import { BONOS, INTERVALOS_SONDEO_MIN } from '../constantes';

export const criterioAlertaSchema = z.enum([
  'DISPONIBILIDAD',
  'HORARIO',
  'RETRASO',
  'APERTURA_VENTA',
]);

export const estadoAlertaSchema = z.enum(['ACTIVA', 'PAUSA', 'COMPLETADA']);

export const crearAlertaSchema = z.object({
  origenNombre: z.string().trim().min(2, 'Indica la estación de origen').max(120),
  destinoNombre: z.string().trim().min(2, 'Indica la estación de destino').max(120),
  fechaViaje: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha inválido (YYYY-MM-DD)')
    .refine((v) => {
      const d = new Date(`${v}T00:00:00Z`);
      return !Number.isNaN(d.getTime());
    }, 'Fecha inválida'),
  horaDesde: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Formato HH:MM')
    .optional()
    .nullable(),
  horaHasta: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Formato HH:MM')
    .optional()
    .nullable(),
  numeroTren: z.string().trim().max(20).optional().nullable(),
  criterio: criterioAlertaSchema.default('DISPONIBILIDAD'),
  // Trayecto cotidiano: sin fecha concreta, se vigila cada día (lun-vie si
  // soloLaborables). La fechaViaje del formulario se ignora en este caso.
  recurrente: z.boolean().default(false),
  soloLaborables: z.boolean().default(false),
  intervaloSondeoMin: z
    .number()
    .int()
    .refine((v) => (INTERVALOS_SONDEO_MIN as readonly number[]).includes(v), {
      message: 'Intervalo no permitido',
    })
    .default(10),
  bono: z.enum(BONOS).default('GENERAL'),
  notas: z.string().trim().max(500).optional().nullable(),
});

export type CrearAlertaInput = z.infer<typeof crearAlertaSchema>;
export type CriterioAlerta = z.infer<typeof criterioAlertaSchema>;
export type EstadoAlerta = z.infer<typeof estadoAlertaSchema>;

export const actualizarAlertaSchema = z.object({
  estado: estadoAlertaSchema.optional(),
  intervaloSondeoMin: z
    .number()
    .int()
    .refine((v) => (INTERVALOS_SONDEO_MIN as readonly number[]).includes(v))
    .optional(),
  notas: z.string().trim().max(500).nullable().optional(),
  // Campos editables de la ruta/viaje
  origenNombre: z.string().trim().min(2, 'Indica la estación de origen').max(120).optional(),
  destinoNombre: z.string().trim().min(2, 'Indica la estación de destino').max(120).optional(),
  fechaViaje: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha inválido (YYYY-MM-DD)')
    .refine((v) => !Number.isNaN(new Date(`${v}T00:00:00Z`).getTime()), 'Fecha inválida')
    .optional(),
  horaDesde: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Formato HH:MM')
    .optional()
    .nullable(),
  horaHasta: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Formato HH:MM')
    .optional()
    .nullable(),
  numeroTren: z.string().trim().max(20).optional().nullable(),
  criterio: criterioAlertaSchema.optional(),
  recurrente: z.boolean().optional(),
  soloLaborables: z.boolean().optional(),
  bono: z.enum(BONOS).optional(),
});

export type ActualizarAlertaInput = z.infer<typeof actualizarAlertaSchema>;

export interface AlertaResponse {
  id: string;
  origenNombre: string;
  destinoNombre: string;
  fechaViaje: string;
  horaDesde: string | null;
  horaHasta: string | null;
  numeroTren: string | null;
  criterio: CriterioAlerta;
  estado: EstadoAlerta;
  /** Trayecto cotidiano: se vigila cada día (no caduca ni se completa). */
  recurrente: boolean;
  /** Solo aplica con `recurrente`: lunes a viernes. */
  soloLaborables: boolean;
  intervaloSondeoMin: number;
  bono: string;
  notas: string | null;
  ultimoSondeoEn: string | null;
  creadaEn: string;
}
