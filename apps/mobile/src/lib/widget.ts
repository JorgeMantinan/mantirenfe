import AsyncStorage from '@react-native-async-storage/async-storage';
import { horaGtfs, type AlertaResponse } from '@mantirenfe/shared-types';

/** Nombre del widget; debe coincidir con `widgets[].name` de app.json. */
export const NOMBRE_WIDGET = 'ProximoTren';
export const CLAVE_DATOS_WIDGET = 'mantirenfe.widget.proxima-salida';
export const MAX_SALIDAS_WIDGET = 3;

export interface SalidaWidget {
  numeroTren: string;
  origen: string;
  destino: string;
  /** Hora peninsular en formato HH:MM. */
  salida: string;
  /** ISO completo de la salida (fecha + hora) para ordenar y comparar. */
  salidaIso: string;
}

export interface DatosWidget {
  /** Fecha local (YYYY-MM-DD) en la que se calcularon las salidas. */
  fecha: string;
  salidas: SalidaWidget[];
  /** ISO de cuando se calcularon por última vez. */
  actualizadoEn: string;
}

const rellenar = (n: number): string => String(n).padStart(2, '0');

export function fechaLocal(d: Date): string {
  return `${d.getFullYear()}-${rellenar(d.getMonth() + 1)}-${rellenar(d.getDate())}`;
}

export function horaLocal(d: Date): string {
  return `${rellenar(d.getHours())}:${rellenar(d.getMinutes())}`;
}

/** ¿La alerta se vigila hoy? (las recurrentes no caducan; soloLaborables = lun-vie). */
export function alertaAplicaHoy(
  alerta: Pick<AlertaResponse, 'recurrente' | 'soloLaborables' | 'fechaViaje'>,
  fecha: string,
): boolean {
  if (!alerta.recurrente) return alerta.fechaViaje === fecha;
  if (!alerta.soloLaborables) return true;
  const dia = new Date(`${fecha}T12:00:00`).getDay();
  return dia !== 0 && dia !== 6;
}

/**
 * Próximas salidas de hoy a partir de los últimos sondeos de las alertas
 * (`ultimoEstado`): no hace falta red, el widget solo lee lo que la app cachea.
 */
export function calcularSalidasWidget(
  alertas: AlertaResponse[],
  ahora: Date = new Date(),
): DatosWidget {
  const fecha = fechaLocal(ahora);
  const hora = horaLocal(ahora);
  const candidatas: SalidaWidget[] = [];

  for (const alerta of alertas) {
    if (alerta.estado !== 'ACTIVA' || !alertaAplicaHoy(alerta, fecha)) continue;

    const delDia = (alerta.ultimoEstado ?? [])
      .filter((tren) => {
        if (tren.cancelado) return false;
        const salida = tren.salida ?? '';
        if (salida.slice(0, 10) !== fecha) return false;
        const hhmm = salida.slice(11, 16);
        if (hhmm < hora) return false;
        if (alerta.horaDesde && hhmm < alerta.horaDesde) return false;
        if (alerta.horaHasta && hhmm > alerta.horaHasta) return false;
        return true;
      })
      .sort((a, b) => a.salida.localeCompare(b.salida))
      .slice(0, MAX_SALIDAS_WIDGET);

    for (const tren of delDia) {
      candidatas.push({
        numeroTren: tren.numeroTren,
        origen: alerta.origenNombre,
        destino: alerta.destinoNombre,
        salida: horaGtfs(tren.salida),
        salidaIso: tren.salida,
      });
    }
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

  return { fecha, salidas, actualizadoEn: ahora.toISOString() };
}

/**
 * Quita del caché las salidas que ya han salido (o de otro día): el widget la
 * usa al refrescarse sin que la app esté abierta.
 */
export function filtrarSalidasVigentes(datos: DatosWidget, ahora: Date = new Date()): DatosWidget {
  const fecha = fechaLocal(ahora);
  if (datos.fecha !== fecha) return { ...datos, fecha, salidas: [] };
  const hora = horaLocal(ahora);
  return { ...datos, salidas: datos.salidas.filter((s) => s.salida >= hora) };
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
