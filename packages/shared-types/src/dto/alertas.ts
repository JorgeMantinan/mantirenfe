import { z } from 'zod';
import { BONOS, INTERVALOS_SONDEO_MIN } from '../constantes';
import type { EstadoSerializado } from './trenes';

export const criterioAlertaSchema = z.enum([
  'DISPONIBILIDAD',
  'HORARIO',
  'RETRASO',
  'APERTURA_VENTA',
  'PRECIO',
]);

export const estadoAlertaSchema = z.enum(['ACTIVA', 'PAUSA', 'COMPLETADA']);

/** Un precio objetivo solo cuenta si es un número positivo (euros). */
function precioObjetivoValido(valor: number | null | undefined): boolean {
  return typeof valor === 'number' && Number.isFinite(valor) && valor > 0;
}

/**
 * Con criterio PRECIO el umbral es obligatorio; en el resto de criterios el
 * campo es opcional y se ignora (la API lo guarda a null).
 */
function exigirPrecioObjetivoSiPrecio(
  valor: { criterio?: string | undefined; precioObjetivo?: number | null | undefined },
  ctx: z.RefinementCtx,
) {
  if (valor.criterio === 'PRECIO' && !precioObjetivoValido(valor.precioObjetivo)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['precioObjetivo'],
      message: 'Indica el precio objetivo (€) del aviso',
    });
  }
}

export const crearAlertaSchema = z
  .object({
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
    // Solo con criterio PRECIO: umbral en € del aviso "avísame si baja de X".
    // En el resto de criterios es opcional y la API lo guarda a null.
    precioObjetivo: z
      .number()
      .positive('El precio objetivo debe ser mayor que 0')
      .nullable()
      .optional(),
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
  })
  .superRefine(exigirPrecioObjetivoSiPrecio);

export type CrearAlertaInput = z.infer<typeof crearAlertaSchema>;
export type CriterioAlerta = z.infer<typeof criterioAlertaSchema>;
export type EstadoAlerta = z.infer<typeof estadoAlertaSchema>;

export const actualizarAlertaSchema = z
  .object({
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
    // Umbral en €: obligatorio si el criterio de este mismo parche pasa a PRECIO
    precioObjetivo: z
      .number()
      .positive('El precio objetivo debe ser mayor que 0')
      .nullable()
      .optional(),
    recurrente: z.boolean().optional(),
    soloLaborables: z.boolean().optional(),
    bono: z.enum(BONOS).optional(),
  })
  .superRefine(exigirPrecioObjetivoSiPrecio);

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
  /** Solo con criterio PRECIO: umbral en €; null en el resto de criterios. */
  precioObjetivo: number | null;
  estado: EstadoAlerta;
  /** Trayecto cotidiano: se vigila cada día (no caduca ni se completa). */
  recurrente: boolean;
  /** Solo aplica con `recurrente`: lunes a viernes. */
  soloLaborables: boolean;
  intervaloSondeoMin: number;
  bono: string;
  notas: string | null;
  ultimoSondeoEn: string | null;
  /** Último estado guardado por el worker (null si aún no hay sondeos). */
  ultimoEstado?: EstadoSerializado[] | null;
  creadaEn: string;
  /**
   * Total de avisos (notificaciones) que ha dado esta alerta. Solo lo calcula
   * el listado (GET /alertas); el resto de endpoints lo omiten.
   */
  avisosRecibidos?: number;
}

/**
 * Aviso (notificación) de una alerta concreta (GET /alertas/:id/avisos):
 * sus últimas 50 notificaciones, de la más reciente a la más antigua.
 */
export interface AvisoAlertaResponse {
  id: string;
  titulo: string;
  cuerpo: string;
  datos: Record<string, unknown> | null;
  leida: boolean;
  creadaEn: string;
}

/**
 * Punto del histórico de precios de una alerta (GET /alertas/:id/precios).
 * El worker solo guarda un punto cuando cambia el precio o la disponibilidad
 * de un tren, o en el primer sondeo.
 */
export interface PuntoPrecio {
  numeroTren: string;
  salida: string;
  precioMin: number | null;
  disponible: boolean;
  /** ISO con la fecha/hora en la que se registró el punto. */
  registradoEn: string;
}
