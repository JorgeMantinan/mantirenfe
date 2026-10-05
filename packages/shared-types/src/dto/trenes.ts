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

/**
 * Día peninsular (YYYY-MM-DD). El worker registra las cancelaciones con el
 * reloj de España, así que la API y la web deben usar el mismo para que el
 * "hoy" por defecto no se desalinee entre las 00:00 y las 02:00 (UTC).
 */
export function fechaGtfs(ahora: Date = new Date()): string {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Madrid',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(ahora);
}

/**
 * Fecha de una fila `@db.Date` ya serializada (la API la envía como ISO
 * completo a medianoche UTC).
 */
export function fechaIso(valor: string | Date): string {
  return typeof valor === 'string' ? valor.slice(0, 10) : valor.toISOString().slice(0, 10);
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

/**
 * Respuesta de `GET /trenes/horarios`. Los campos nuevos son opcionales para
 * no romper a clientes que solo lean `fuente` y `trenes`: permiten distinguir
 * "la estación no existe" de "existe pero no hay trenes" y pintar un mensaje
 * (y una llamada a la acción) distintos en web y móvil.
 */
export interface HorariosResponse {
  fuente: string;
  trenes: HorarioTrenResponse[];
  /** false → alguna estación de la consulta no está en la BD */
  estacionesEncontradas?: boolean;
  /** Por qué la lista está vacía (solo se envía cuando `trenes` está vacío) */
  motivo?: MotivoHorarios;
  /** Textos de búsqueda que no resolvieron (solo con motivo = 'estaciones') */
  estacionesNoEncontradas?: string[];
}

export type MotivoHorarios = 'estaciones' | 'sin-trenes';

export interface PosicionTrenResponse {
  id: string;
  numeroTren: string | null;
  latitud: number;
  longitud: number;
  velocidadKmh: number | null;
  retrasoSeg: number | null;
  actualizadaEn: string;
  cancelado?: boolean;
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
  tripId?: string | null;
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

/**
 * Duración en minutos en formato corto ("4h35", "55m"): lo usan la tabla de
 * "Plazas de hoy" (web y móvil) para poder comparar trenes rápidos y lentos.
 */
export function duracionCorta(minutos: number): string {
  if (!Number.isFinite(minutos) || minutos < 0) return '—';
  const horas = Math.floor(minutos / 60);
  const resto = Math.round(minutos % 60);
  return horas > 0 ? `${horas}h${String(resto).padStart(2, '0')}` : `${resto}m`;
}

export interface EstadoTrenDisponible {
  trenId: string;
  numeroTren: string;
  salida: string;
  disponible: boolean;
  precioMin: number | null;
  moneda: string;
  retrasoSeg?: number | null;
  cancelado?: boolean;
  /** Nombres de estación que el tren no hace hoy (GTFS-RT SKIPPED) */
  paradasSuprimidas?: string[];
  /**
   * 'directo' = un solo tren; 'conexion' = dos tramos con transbordo. La venta
   * DWR mezcla ambos en la misma lista y antes no se podían distinguir (dos
   * conexiones con el mismo primer tramo parecían el mismo tren repetido).
   */
  tramo?: 'directo' | 'conexion';
  /** Estación donde se hace el transbordo (solo conexiones) */
  conexionEn?: string;
  /** Hora peninsular (HH:MM) en la que el primer tramo llega a `conexionEn` */
  conexionLlegada?: string;
  /** Hora peninsular (HH:MM) en la que el segundo tramo sale de `conexionEn` */
  conexionSalida?: string;
  /** Espera en la estación de enlace en minutos (solo si es calculable) */
  esperaMin?: number;
  /** Hora peninsular de llegada programada (HH:MM) */
  horaLlegada?: string;
  /** Duración total del viaje en minutos (para comparar rápido/lento) */
  duracionMin?: number;
  /** Tipo de servicio que trae la venta (AVE, AVLO, AVANT, MD...) */
  tipoTren?: string;
  /** Nombre de la tarifa más barata del listado (Básico, Elige...) */
  tarifa?: string;
}

export interface EstadoDisponibilidad {
  consulta: ConsultaDisponibilidad;
  trenes: EstadoTrenDisponible[];
  consultadoEn: string;
}

/**
 * Estado de disponibilidad ya serializado: es lo que el worker guarda en
 * `alerta.ultimoEstado` y lo que la API devuelve en `AlertaResponse.ultimoEstado`
 * para pintar las plazas de cada tren en web y móvil.
 */
export interface EstadoSerializado {
  trenId: string;
  numeroTren: string;
  salida: string;
  disponible: boolean;
  precioMin: number | null;
  retrasoSeg?: number | null;
  cancelado?: boolean;
  /**
   * Estaciones (origen o destino del tren) que no se hace hoy: solo se guarda
   * si hay alguna, para no inflar `alerta.ultimoEstado`.
   */
  paradasSuprimidas?: string[];
  /** 'directo' o 'conexion' (dos tramos con transbordo) */
  tramo?: 'directo' | 'conexion';
  /** Estación del transbordo: la UI lo pinta como "conexión en X" */
  conexionEn?: string;
  /** Hora peninsular (HH:MM) de llegada del primer tramo a `conexionEn` */
  conexionLlegada?: string;
  /** Hora peninsular (HH:MM) de salida del segundo tramo desde `conexionEn` */
  conexionSalida?: string;
  /** Espera en la estación de enlace en minutos (omitida si no es fiable) */
  esperaMin?: number;
  /** Hora peninsular de llegada (HH:MM) */
  horaLlegada?: string;
  /** Duración total del viaje en minutos */
  duracionMin?: number;
  /** Tipo de servicio (AVE, AVLO, AVANT, MD...) */
  tipoTren?: string;
  /** Tarifa más barata (Básico, Elige...) */
  tarifa?: string;
  /**
   * Criterio de la alerta al que pertenece esta fila del estado (multi-criterio):
   * `ultimoEstado` mezcla las series de los criterios vigilados y este campo es
   * lo que permite comparar cada diff contra SU estado anterior. Los estados
   * guardados por versiones anteriores no lo traen: son del criterio legado.
   */
  criterio?: string;
}

/**
 * Línea de conexión de "Plazas de hoy" (web y móvil): estación de enlace y, si
 * la fuente los trae, la hora a la que llega el primer tramo y la de salida del
 * segundo. Los tres campos son opcionales (compatibilidad con estados guardados
 * antes de existir), así que se pinta lo que haya:
 * "Conexión en MADRID-CHAMARTÍN — llega 12:15 · sale 13:40 (espera 1h25)".
 */
export function textoConexion(tren: {
  conexionEn?: string;
  conexionLlegada?: string;
  conexionSalida?: string;
  esperaMin?: number;
}): string {
  const horas: string[] = [];
  if (tren.conexionLlegada) horas.push(`llega ${tren.conexionLlegada}`);
  if (tren.conexionSalida) horas.push(`sale ${tren.conexionSalida}`);
  const espera =
    typeof tren.esperaMin === 'number' && Number.isFinite(tren.esperaMin) && tren.esperaMin > 0
      ? ` (espera ${duracionCorta(tren.esperaMin)})`
      : '';
  const detalle = horas.length > 0 ? `${horas.join(' · ')}${espera}` : '';
  if (!detalle) return `Conexión en ${tren.conexionEn ?? '—'}`;
  // Con estación se separa con "—"; sin ella no se duplica el guion
  return `Conexión en ${tren.conexionEn ?? '—'}${tren.conexionEn ? ' — ' : ' '}${detalle}`;
}

/**
 * Ranking mensual de impuntualidad (servicios con retraso >= umbral).
 *
 * Cada fila es un **eje** del servicio (origen → destino del trip, resueltos
 * con `ParadaHorario`), no un vehículo físico: la misma unidad que hace dos
 * rutas distintas aparece en dos filas, y cada una cuenta solo sus propios
 * servicios. Los trips sin paradas en el feed caen al agrupado por
 * `vehiculoId` (antigua semántica) y se enriquecen con `HorarioTren`.
 */
export interface PuntualidadTrenResponse {
  /** Vehículo representativo del grupo (el que más servicios impuntuales sumó) */
  vehiculoId: string;
  numeroTren: string | null;
  /** Nº de servicios distintos (trip+fecha) impuntuales en el mes de ese eje */
  vecesImpuntuales: number;
  /** Media del retraso máximo de cada servicio, en segundos */
  retrasoMedioSeg: number;
  /** Peor retraso visto en el mes, en segundos */
  retrasoMaxSeg: number;
  /** Origen real del eje (nombre desde `Estacion`) */
  origenNombre?: string | null;
  /** Destino real del eje (nombre desde `Estacion`) */
  destinoNombre?: string | null;
  /** Salida programada del eje (hora peninsular HH:MM) */
  salida?: string | null;
  /** Fecha del servicio impuntual representativo (YYYY-MM-DD) */
  fecha?: string | null;
  /** Llegada programada del eje: última parada de sus trips (HH:MM) */
  llegada?: string | null;
  /**
   * Llegada programada + `retrasoMaxSeg` del eje: estimación orientativa,
   * NO una hora oficial (HH:MM).
   */
  llegadaEstimada?: string | null;
  /** Clave estable del grupo (eje o vehículo si no hay paradas): id de fila en las UI */
  clave?: string | null;
}

/**
 * Fila de `GET /suprimidos`: un tren con cancelación registrada (GTFS-RT
 * CANCELED) para la fecha consultada.
 *
 * `origen`/`destino`/`salida`/`llegada` son `null` cuando no hay datos que los
 * sustenten (la trip no está en `HorarioTren` ni tiene paradas conocidas): la
 * fila se devuelve igual para poder enseñarla con el badge "Sin datos".
 * Las horas son hora peninsular en HH:MM.
 */
export interface SuprimidoResponse {
  tripId: string;
  numeroTren: string | null;
  /** Día de la detección (YYYY-MM-DD) */
  fecha: string;
  origen: string | null;
  destino: string | null;
  salida: string | null;
  llegada: string | null;
}
