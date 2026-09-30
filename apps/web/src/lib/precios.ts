import { horaGtfs, type PuntoPrecio } from '@mantirenfe/shared-types';
import { i18n, locale } from '@/i18n';

/** Serie de un tren concreto, agrupada por numeroTren + salida. */
export interface SeriePrecio {
  clave: string;
  numeroTren: string;
  salida: string;
  /** Orden cronológico ascendente (como devuelve la API). */
  puntos: PuntoPrecio[];
  minimo: number | null;
  maximo: number | null;
}

/** Punto con sus sondeos consecutivos a ese mismo precio. */
export interface ContagoPrecio extends PuntoPrecio {
  /** Cuántos sondeos seguidos hay a este precio. */
  cantidad: number;
}

/** Puntos máximos pintados por tren para que la tarjeta no se dispare. */
export const MAX_PUNTOS_GRAFICA = 100;

/** Tramos de precio (grupos) que se pintan como máximo en la tarjeta. */
export const MAX_GRUPOS_GRAFICA = 8;

export function formatearPrecio(precioMin: number | null): string {
  if (precioMin === null) return '—';
  return precioMin.toLocaleString(locale(), { style: 'currency', currency: 'EUR' });
}

export function agruparPrecios(puntos: PuntoPrecio[]): SeriePrecio[] {
  const porClave = new Map<string, SeriePrecio>();
  for (const punto of puntos) {
    const clave = `${punto.numeroTren}|${punto.salida}`;
    let serie = porClave.get(clave);
    if (!serie) {
      serie = {
        clave,
        numeroTren: punto.numeroTren,
        salida: punto.salida,
        puntos: [],
        minimo: null,
        maximo: null,
      };
      porClave.set(clave, serie);
    }
    serie.puntos.push(punto);
    if (punto.precioMin === null) continue;
    serie.minimo =
      serie.minimo === null ? punto.precioMin : Math.min(serie.minimo, punto.precioMin);
    serie.maximo =
      serie.maximo === null ? punto.precioMin : Math.max(serie.maximo, punto.precioMin);
  }
  return [...porClave.values()];
}

/**
 * Une puntos consecutivos con el mismo precioMin en un único elemento con
 * `cantidad` (sondeos seguidos a ese precio) y el resto de campos del primero.
 * Un cambio de precio corta la agrupación: cada tramo es una fila de la tarjeta.
 */
export function agruparContagos(puntos: PuntoPrecio[]): ContagoPrecio[] {
  const contagos: ContagoPrecio[] = [];
  for (const punto of puntos) {
    const ultimo = contagos[contagos.length - 1];
    if (ultimo && ultimo.precioMin === punto.precioMin) {
      ultimo.cantidad += 1;
      continue;
    }
    contagos.push({ ...punto, cantidad: 1 });
  }
  return contagos;
}

/** true si todo el rango mantiene el mismo precio (o solo hay un punto). */
export function esSeriePlana(puntos: PuntoPrecio[]): boolean {
  const primero = puntos[0]?.precioMin;
  if (primero === undefined || primero === null) return false;
  return puntos.every((punto) => punto.precioMin === primero);
}

/** "08:00 · tren 03311 — 38,00 € (sin cambios · 12 sondeos)": serie plana en una línea. */
export function textoSerieCompacta(serie: SeriePrecio): string {
  const sondeos = serie.puntos.length;
  const hora = horaGtfs(serie.salida);
  const tren = serie.numeroTren ? i18n.t('precios.serieTren', { tren: serie.numeroTren }) : '';
  const resumen = i18n.t('precios.serieResumen', { n: sondeos, plural: sondeos === 1 ? '' : 's' });
  return `${hora}${tren} — ${formatearPrecio(serie.minimo)} ${resumen}`;
}

/**
 * Últimos MAX_GRUPOS_GRAFICA grupos (los más recientes) y cuántos sondeos de
 * los grupos anteriores quedan fuera del gráfico.
 */
export function recortarContagos(contagos: ContagoPrecio[]): {
  visibles: ContagoPrecio[];
  sondeosOcultos: number;
} {
  if (contagos.length <= MAX_GRUPOS_GRAFICA) {
    return { visibles: contagos, sondeosOcultos: 0 };
  }
  const ocultos = contagos.slice(0, contagos.length - MAX_GRUPOS_GRAFICA);
  return {
    visibles: contagos.slice(-MAX_GRUPOS_GRAFICA),
    sondeosOcultos: ocultos.reduce((total, grupo) => total + grupo.cantidad, 0),
  };
}

/** "…y 37 sondeos anteriores" (singular si solo queda uno fuera). */
export function textoSondeosOcultos(sondeos: number): string {
  if (sondeos <= 0) return '';
  if (sondeos === 1) return i18n.t('precios.sondeosOcultos1');
  return i18n.t('precios.sondeosOcultosN', { n: sondeos });
}

/**
 * Ancho (0-100) de la barra de un punto: proporcional al rango min→max de su
 * tren. El mínimo se queda en un 8% para que la mejor opción siga viéndose.
 * Funciona igual con el precioMin de un grupo agrupado.
 */
export function anchoBarra(
  precioMin: number | null,
  minimo: number | null,
  maximo: number | null,
): number {
  if (precioMin === null || minimo === null || maximo === null) return 0;
  if (maximo <= minimo) return 100;
  return Math.max(8, Math.round(((precioMin - minimo) / (maximo - minimo)) * 100));
}

function fechaCorta(iso: string): string {
  return new Date(iso).toLocaleDateString(locale(), { day: 'numeric', month: 'short' });
}

/** Horas redondeadas entre dos marcas de tiempo, con un mínimo de 1 h. */
function horasEntre(desde: string, hasta: string): number {
  const horas = (Date.parse(hasta) - Date.parse(desde)) / 3_600_000;
  return Number.isFinite(horas) ? Math.max(1, Math.round(horas)) : 1;
}

/**
 * "¿Compro ahora o espero?": compara el último precio de la serie con el
 * mínimo de su histórico para generar una recomendación en una línea.
 */
export function consejoPrecio(puntos: PuntoPrecio[]): string {
  const conPrecio = puntos.filter(
    (p): p is PuntoPrecio & { precioMin: number } => p.precioMin !== null,
  );
  const primero = conPrecio[0];
  if (!primero) return i18n.t('precios.sinDatos');
  const ultimo = conPrecio[conPrecio.length - 1] ?? primero;

  const minimo = conPrecio.reduce((m, p) => (p.precioMin < m.precioMin ? p : m), primero);

  if (ultimo.precioMin > minimo.precioMin) {
    return i18n.t('precios.sube', {
      precio: formatearPrecio(minimo.precioMin),
      fecha: fechaCorta(minimo.registradoEn),
    });
  }

  // El último es el mínimo: si antes hubo algún precio más alto, ya ha bajado
  let maximoAnterior: number | null = null;
  for (const p of conPrecio.slice(0, -1)) {
    if (p.precioMin > ultimo.precioMin) {
      maximoAnterior =
        maximoAnterior === null ? p.precioMin : Math.max(maximoAnterior, p.precioMin);
    }
  }
  if (maximoAnterior !== null) {
    return i18n.t('precios.haBajado', { precio: formatearPrecio(maximoAnterior) });
  }
  return i18n.t('precios.estable', {
    horas: horasEntre(primero.registradoEn, ultimo.registradoEn),
  });
}
