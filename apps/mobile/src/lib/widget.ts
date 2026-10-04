import AsyncStorage from '@react-native-async-storage/async-storage';
import { horaGtfs, type AlertaResponse } from '@mantirenfe/shared-types';
import { locale, t } from '../i18n';
import { formatearPrecio } from './precios';

/** Nombre del widget; debe coincidir con `widgets[].name` de app.json. */
export const NOMBRE_WIDGET = 'ProximoTren';
/** Widget compacto 2×2 (misma caché y misma lógica que el grande). */
export const NOMBRE_WIDGET_MINI = 'ProximoTrenMini';
export const CLAVE_DATOS_WIDGET = 'mantirenfe.widget.proxima-salida';
export const MAX_SALIDAS_WIDGET = 3;
/** Si hoy no queda nada, cuántos días hacia delante mira el widget. */
export const DIAS_ADELANTE_WIDGET = 7;

export interface SalidaWidget {
  numeroTren: string;
  origen: string;
  destino: string;
  /** Hora peninsular en formato HH:MM. */
  salida: string;
  /** ISO completo de la salida (fecha + hora) para ordenar y comparar. */
  salidaIso: string;
  /** Fecha local (YYYY-MM-DD) de la salida; en cachés antiguas puede faltar. */
  fecha?: string;
  // ── estado del `ultimoEstado` del tren: opcional, las cachés antiguas no lo traen ──
  /** ¿Quedan plazas? */
  disponible?: boolean;
  /** Precio más barato visto en € (null si aún no hay precio). */
  precioMin?: number | null;
  /** Retraso del feed en segundos (null si va a la hora). */
  retrasoSeg?: number | null;
  /** El tren no circula (el cálculo lo descarta, pero el campo se conserva). */
  cancelado?: boolean;
  /** Llegada programada peninsular (HH:MM) si la venta la conoce. */
  horaLlegada?: string;
}

export interface DatosWidget {
  /** Fecha local (YYYY-MM-DD) en la que se calcularon las salidas. */
  fecha: string;
  salidas: SalidaWidget[];
  /** ISO de cuando se calcularon por última vez. */
  actualizadoEn: string;
  /**
   * Próximo viaje conocido (YYYY-MM-DD) cuando no hay ninguna salida en los
   * próximos días: el widget pinta "Próximo viaje: 3 oct" en vez de un vacío.
   */
  proximoViaje?: string;
}

const rellenar = (n: number): string => String(n).padStart(2, '0');

const DIAS_SEMANA = [
  'domingo',
  'lunes',
  'martes',
  'miercoles',
  'jueves',
  'viernes',
  'sabado',
] as const;

type ClaveDia =
  | 'semana.domingo'
  | 'semana.lunes'
  | 'semana.martes'
  | 'semana.miercoles'
  | 'semana.jueves'
  | 'semana.viernes'
  | 'semana.sabado';

const CLAVES_DIAS: Record<(typeof DIAS_SEMANA)[number], ClaveDia> = {
  domingo: 'semana.domingo',
  lunes: 'semana.lunes',
  martes: 'semana.martes',
  miercoles: 'semana.miercoles',
  jueves: 'semana.jueves',
  viernes: 'semana.viernes',
  sabado: 'semana.sabado',
};

const MESES_ES = [
  'ene',
  'feb',
  'mar',
  'abr',
  'may',
  'jun',
  'jul',
  'ago',
  'sep',
  'oct',
  'nov',
  'dic',
] as const;

const MESES_EN = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

export function fechaLocal(d: Date): string {
  return `${d.getFullYear()}-${rellenar(d.getMonth() + 1)}-${rellenar(d.getDate())}`;
}

export function horaLocal(d: Date): string {
  return `${rellenar(d.getHours())}:${rellenar(d.getMinutes())}`;
}

/** Suma días a una fecha local (YYYY-MM-DD) sin sorpresas de zona horaria. */
export function sumarDias(fecha: string, dias: number): string {
  const [anio, mes, dia] = fecha.split('-').map(Number);
  const d = new Date(anio ?? 1970, (mes ?? 1) - 1, (dia ?? 1) + dias);
  return fechaLocal(d);
}

/**
 * Etiqueta del día de una salida para el widget: vacío si es hoy (o ya pasó),
 * "mañana" si es el día siguiente o "lunes 29" para el resto.
 */
export function etiquetaDia(fecha: string, hoy: Date = new Date()): string | null {
  const hoyIso = fechaLocal(hoy);
  if (!fecha || fecha <= hoyIso) return null;
  if (fecha === sumarDias(hoyIso, 1)) return t('widget.manana');
  const [anio, mes, dia] = fecha.split('-').map(Number);
  const dow = new Date(anio ?? 1970, (mes ?? 1) - 1, dia ?? 1).getDay();
  const claveDia = DIAS_SEMANA[dow];
  const nombre = claveDia ? t(CLAVES_DIAS[claveDia]) : '';
  return `${nombre} ${dia ?? ''}`.trim();
}

/** Fecha corta para el widget ("3 oct"). */
export function fechaCorta(fecha: string): string {
  const [, mes, dia] = fecha.split('-').map(Number);
  const meses = locale().startsWith('en') ? MESES_EN : MESES_ES;
  return `${dia ?? ''} ${meses[(mes ?? 1) - 1] ?? ''}`.trim();
}

/**
 * ¿La alerta se vigila en esa fecha? (las recurrentes no caducan y respetan
 * sus `diasSemana`; las de fecha flexible, cualquier día; las puntuales, su
 * fecha de viaje).
 */
export function alertaAplicaHoy(
  alerta: Pick<AlertaResponse, 'recurrente' | 'diasSemana' | 'fechaViaje' | 'fechaFlexible'>,
  fecha: string,
): boolean {
  if (alerta.fechaFlexible) return true;
  if (!alerta.recurrente) return alerta.fechaViaje === fecha;
  if (alerta.diasSemana.length === 0) return true;
  const dia = new Date(`${fecha}T12:00:00`).getDay();
  return alerta.diasSemana.includes(dia);
}

/**
 * Próximas salidas a partir de los últimos sondeos de las alertas
 * (`ultimoEstado`): no hace falta red, el widget solo lee lo que la app cachea.
 *
 * Si hoy no queda ninguna salida (o la alerta es de otro día), mira hasta
 * `DIAS_ADELANTE_WIDGET` días hacia delante y devuelve las primeras con su
 * fecha; si no hay ninguna, guarda `proximoViaje` (la fecha de viaje futura
 * más próxima de las alertas) para que el widget lo pueda mostrar.
 */
export function calcularSalidasWidget(
  alertas: AlertaResponse[],
  ahora: Date = new Date(),
): DatosWidget {
  const fecha = fechaLocal(ahora);
  const hora = horaLocal(ahora);
  const candidatas: SalidaWidget[] = [];

  for (let dia = 0; dia <= DIAS_ADELANTE_WIDGET; dia++) {
    const delDia = sumarDias(fecha, dia);
    for (const alerta of alertas) {
      if (alerta.estado !== 'ACTIVA' || !alertaAplicaHoy(alerta, delDia)) continue;

      const salidas = (alerta.ultimoEstado ?? [])
        .filter((tren) => {
          if (tren.cancelado) return false;
          const salida = tren.salida ?? '';
          if (salida.slice(0, 10) !== delDia) return false;
          const hhmm = salida.slice(11, 16);
          // Hoy solo interesan las salidas que aún no han salido
          if (dia === 0 && hhmm < hora) return false;
          if (alerta.horaDesde && hhmm < alerta.horaDesde) return false;
          if (alerta.horaHasta && hhmm > alerta.horaHasta) return false;
          return true;
        })
        .sort((a, b) => a.salida.localeCompare(b.salida))
        .slice(0, MAX_SALIDAS_WIDGET);

      for (const tren of salidas) {
        candidatas.push({
          numeroTren: tren.numeroTren,
          origen: alerta.origenNombre,
          destino: alerta.destinoNombre,
          salida: horaGtfs(tren.salida),
          salidaIso: tren.salida,
          fecha: delDia,
          disponible: tren.disponible,
          precioMin: tren.precioMin,
          retrasoSeg: tren.retrasoSeg ?? undefined,
          cancelado: tren.cancelado ?? undefined,
          horaLlegada: tren.horaLlegada,
        });
      }
    }
    if (candidatas.length >= MAX_SALIDAS_WIDGET) break;
  }

  const vistas = new Set<string>();
  const salidas = candidatas
    .sort((a, b) => a.salidaIso.localeCompare(b.salidaIso))
    .filter((s) => {
      const clave = `${s.numeroTren}|${s.salidaIso}`;
      if (vistas.has(clave)) return false;
      vistas.add(clave);
      return true;
    })
    .slice(0, MAX_SALIDAS_WIDGET);

  // Sin salidas: la fecha de viaje futura más próxima, para el estado vacío
  const proximoViaje =
    salidas.length === 0
      ? alertas
          .filter((a) => a.estado === 'ACTIVA' && !a.recurrente && a.fechaViaje > fecha)
          .map((a) => a.fechaViaje)
          .sort()[0]
      : undefined;

  return { fecha, salidas, actualizadoEn: ahora.toISOString(), proximoViaje };
}

/**
 * Quita del caché las salidas que ya han pasado o son de días anteriores: el
 * widget la usa al refrescarse sin que la app esté abierta. Las de días
 * futuros se conservan (son las que pinta cuando la alerta es de mañana).
 */
export function filtrarSalidasVigentes(datos: DatosWidget, ahora: Date = new Date()): DatosWidget {
  const fecha = fechaLocal(ahora);
  const hora = horaLocal(ahora);
  const salidas = datos.salidas.filter((s) => {
    const delDia = s.fecha ?? datos.fecha;
    if (delDia < fecha) return false;
    if (delDia > fecha) return true;
    return s.salida >= hora;
  });
  const proximoViaje = datos.proximoViaje;
  return {
    ...datos,
    fecha,
    salidas,
    proximoViaje: proximoViaje && proximoViaje >= fecha ? proximoViaje : undefined,
  };
}

/** Tono del badge de estado de una salida (para colorearlo en los widgets). */
export type TonoEstadoWidget = 'exito' | 'error' | 'neutro' | 'sinDatos';

export interface EstadoWidget {
  /** Texto ya traducido del badge. */
  texto: string;
  tono: TonoEstadoWidget;
}

/** Retraso mínimo (segundos) a partir del cual el widget enseña «+N min». */
export const RETRASO_WIDGET_SEG = 300;

/**
 * Badge de estado de una salida según su último sondeo: cancelado (rojo),
 * plazas con precio o sin precio (verde), completo (gris) y «—» si la caché no
 * guarda los campos de estado (salidas escritas por versiones anteriores).
 * `corto` usa la fórmula breve del widget mini, que no cabe con «desde».
 */
export function estadoSalidaWidget(
  salida: Pick<SalidaWidget, 'disponible' | 'precioMin' | 'cancelado'> | null | undefined,
  { corto = false }: { corto?: boolean } = {},
): EstadoWidget {
  if (salida?.cancelado) return { texto: t('comunes.cancelado'), tono: 'error' };
  if (typeof salida?.disponible !== 'boolean') {
    return { texto: t('widget.sinDatos'), tono: 'sinDatos' };
  }
  if (!salida.disponible) return { texto: t('comunes.completo'), tono: 'neutro' };
  if (salida.precioMin === null || salida.precioMin === undefined) {
    return { texto: t('comunes.hayPlazas'), tono: 'exito' };
  }
  const precio = formatearPrecio(salida.precioMin);
  return {
    texto: t(corto ? 'widget.plazasCorto' : 'widget.plazasDesde', { precio }),
    tono: 'exito',
  };
}

/**
 * Minutos de retraso a pintar en rojo junto a la salida, o null si el tren
 * no lleva `RETRASO_WIDGET_SEG` o más de retraso (por debajo no se molesta).
 */
export function retrasoWidget(
  salida: Pick<SalidaWidget, 'retrasoSeg'> | null | undefined,
): number | null {
  const seg = salida?.retrasoSeg;
  if (typeof seg !== 'number' || seg < RETRASO_WIDGET_SEG) return null;
  return Math.round(seg / 60);
}

export interface ResumenWidget {
  /** Próxima salida (null si no hay): hora, tren y ruta corta. */
  hora: string | null;
  numeroTren: string | null;
  ruta: string | null;
  /** Etiqueta del día de la próxima salida (null si es hoy). */
  dia: string | null;
  /** Texto del estado vacío (null si hay salidas). */
  vacio: string | null;
}

/**
 * Resumen mínimo que pinta el widget pequeño (2×2): una sola salida o el
 * estado vacío. Comparte la caché y el cálculo con el widget grande.
 */
export function resumenWidget(datos: DatosWidget | null, hoy: Date = new Date()): ResumenWidget {
  const salida = datos?.salidas?.[0];
  if (!salida) {
    const proximo = datos?.proximoViaje;
    return {
      hora: null,
      numeroTren: null,
      ruta: null,
      dia: null,
      vacio: proximo
        ? t('widget.proximoViaje', { fecha: fechaCorta(proximo) })
        : t('widget.sinSalidasCorto'),
    };
  }
  const fecha = salida.fecha ?? datos?.fecha ?? '';
  return {
    hora: salida.salida,
    numeroTren: salida.numeroTren,
    ruta: `${salida.origen} → ${salida.destino}`,
    dia: etiquetaDia(fecha, hoy),
    vacio: null,
  };
}

export async function leerDatosWidget(): Promise<DatosWidget | null> {
  try {
    const bruto = await AsyncStorage.getItem(CLAVE_DATOS_WIDGET);
    if (!bruto) return null;
    const datos = JSON.parse(bruto) as Partial<DatosWidget>;
    if (typeof datos.fecha !== 'string' || !Array.isArray(datos.salidas)) return null;
    return datos as DatosWidget;
  } catch {
    return null;
  }
}

export async function guardarDatosWidget(datos: DatosWidget): Promise<void> {
  try {
    await AsyncStorage.setItem(CLAVE_DATOS_WIDGET, JSON.stringify(datos));
  } catch {
    // Mejor esfuerzo: sin caché el widget muestra su estado vacío.
  }
}
