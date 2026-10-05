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

/**
 * Días de la semana aplicables en formato JS `getUTCDay`: 0 = domingo,
 * 1 = lunes … 6 = sábado. Es el formato canónico de `Alerta.diasSemana`
 * (vacío = todos los días).
 */
export const DIAS_SEMANA = [0, 1, 2, 3, 4, 5, 6] as const;

/** Lunes a viernes: el equivalente al antiguo `soloLaborables`. */
export const DIAS_LABORABLES = [1, 2, 3, 4, 5] as const;

/**
 * Horizonte del sondeo flexible ("cualquier fecha en los próximos 6 meses"):
 * días entre `fechaDesde` (hoy) y `fechaHasta` (hoy + 180) por defecto.
 */
export const HORIZONTE_FLEXIBLE_DIAS = 180;

/** Un día de la semana válido (0 = domingo … 6 = sábado). */
export const diaSemanaSchema = z.number().int().min(0).max(6);

/**
 * Fecha en `YYYY-MM-DD` (la que usan `fechaViaje`, `fechaDesde` y `fechaHasta`).
 */
export const fechaIsoSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha inválido (YYYY-MM-DD)')
  .refine((v) => !Number.isNaN(new Date(`${v}T00:00:00Z`).getTime()), 'Fecha inválida');

/**
 * Días únicos, dentro de 0-6 y en orden: la forma en la que se persiste
 * `Alerta.diasSemana` (defensa ante entradas repetidas o sucias).
 */
export function normalizarDiasSemana(dias: readonly number[] | null | undefined): number[] {
  if (!Array.isArray(dias)) return [];
  const unicos = new Set(dias.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6));
  return [...unicos].sort((a, b) => a - b);
}

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

/** Campos de frecuencia que comparten crear y actualizar. */
type FrecuenciaInput = {
  recurrente?: boolean | undefined;
  fechaFlexible?: boolean | undefined;
  fechaDesde?: string | undefined;
  fechaHasta?: string | undefined;
};

/**
 * Reglas de la frecuencia:
 * - "cualquier fecha" (flexible) y "trayecto cotidiano" (recurrente) son
 *   modalidades incompatibles: la primera rota por un rango de fechas y la
 *   segunda trabaja todos los días desde hoy.
 * - El rango del sondeo flexible debe ir de menor a mayor.
 */
function exigirFrecuenciaCoherente(valor: FrecuenciaInput, ctx: z.RefinementCtx) {
  if (valor.fechaFlexible && valor.recurrente) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['fechaFlexible'],
      message: 'No puedes combinar "cualquier fecha" con un trayecto recurrente',
    });
  }
  if (valor.fechaDesde && valor.fechaHasta && valor.fechaDesde > valor.fechaHasta) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['fechaHasta'],
      message: 'La fecha final debe ser posterior a la inicial',
    });
  }
}

export const crearAlertaSchema = z
  .object({
    origenNombre: z.string().trim().min(2, 'Indica la estación de origen').max(120),
    destinoNombre: z.string().trim().min(2, 'Indica la estación de destino').max(120),
    fechaViaje: fechaIsoSchema,
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
    // Trayecto cotidiano: sin fecha concreta, se vigila cada día (los que marque
    // `diasSemana`; vacío = todos). La fechaViaje del formulario se ignora.
    recurrente: z.boolean().default(false),
    // Días aplicables (0 = domingo … 6 = sábado). Opcional: si no viene, la API
    // cae en el legado `soloLaborables` (true = [1,2,3,4,5]) y si tampoco, en
    // "todos los días". Solo se usa con recurrente.
    diasSemana: z.array(diaSemanaSchema).max(7).optional(),
    // LEGACY: se acepta por compatibilidad y la API lo convierte a diasSemana.
    soloLaborables: z.boolean().default(false),
    // "Cualquier fecha en los próximos 6 meses": el worker rota por el rango
    // [fechaDesde, fechaHasta] (defaults: hoy y hoy + 180 días) hasta que
    // encuentra billetes. Si no es flexible, los dos campos se ignoran.
    fechaFlexible: z.boolean().default(false),
    fechaDesde: fechaIsoSchema.optional(),
    fechaHasta: fechaIsoSchema.optional(),
    intervaloSondeoMin: z
      .number()
      .int()
      .refine((v) => (INTERVALOS_SONDEO_MIN as readonly number[]).includes(v), {
        message: 'Intervalo no permitido',
      })
      .default(10),
    bono: z.enum(BONOS).default('GENERAL'),
    notas: z.string().trim().max(500).optional().nullable(),
    // Agrupación ida/vuelta: id de la alerta de IDA creada justo antes. La API
    // comprueba que existe y que es del mismo usuario.
    grupoId: z.string().trim().min(1).max(40).optional().nullable(),
  })
  .superRefine((valor, ctx) => {
    exigirPrecioObjetivoSiPrecio(valor, ctx);
    exigirFrecuenciaCoherente(valor, ctx);
  });

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
    fechaViaje: fechaIsoSchema.optional(),
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
    // Días aplicables (0 = domingo … 6 = sábado); vacío = todos los días.
    diasSemana: z.array(diaSemanaSchema).max(7).optional(),
    // LEGACY: se acepta por compatibilidad y la API lo convierte a diasSemana.
    soloLaborables: z.boolean().optional(),
    // Rango del sondeo flexible; solo se guarda si la alerta (acaba de ser) flexible.
    fechaFlexible: z.boolean().optional(),
    fechaDesde: fechaIsoSchema.optional(),
    fechaHasta: fechaIsoSchema.optional(),
    bono: z.enum(BONOS).optional(),
  })
  .superRefine((valor, ctx) => {
    exigirPrecioObjetivoSiPrecio(valor, ctx);
    exigirFrecuenciaCoherente(valor, ctx);
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
  /** Solo con criterio PRECIO: umbral en €; null en el resto de criterios. */
  precioObjetivo: number | null;
  estado: EstadoAlerta;
  /** Trayecto cotidiano: se vigila cada día (no caduca ni se completa). */
  recurrente: boolean;
  /**
   * Días aplicables del trayecto recurrente (0 = domingo … 6 = sábado, formato
   * JS `getUTCDay`). Vacío = todos los días. Es el único formato del DTO: el
   * antiguo `soloLaborables` solo se acepta como entrada y la API lo traduce.
   */
  diasSemana: number[];
  /**
   * "Cualquier fecha en los próximos 6 meses": la alerta no se ancla a
   * `fechaViaje` sino que el worker rota por el rango `fechaDesde`–`fechaHasta`.
   */
  fechaFlexible: boolean;
  /** Inicio del rango flexible (YYYY-MM-DD); null si no es flexible. */
  fechaDesde: string | null;
  /** Fin del rango flexible (YYYY-MM-DD); null si no es flexible. */
  fechaHasta: string | null;
  intervaloSondeoMin: number;
  bono: string;
  notas: string | null;
  ultimoSondeoEn: string | null;
  /** Último estado guardado por el worker (null si aún no hay sondeos). */
  ultimoEstado?: EstadoSerializado[] | null;
  creadaEn: string;
  /**
   * Agrupación ida/vuelta: id de la alerta de IDA (ancla) cuando esta es la
   * vuelta; null en las sueltas y en la propia ida. El listado coloca cada
   * vuelta justo detrás de su ancla.
   */
  grupoId: string | null;
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
