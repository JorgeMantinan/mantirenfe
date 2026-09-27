import type { PuntoPrecio } from '@mantirenfe/shared-types';

/** Fila de `PrecioTren` tal y como sale de Prisma. */
export interface FilaPrecio {
  numeroTren: string;
  salida: string;
  precioMin: number | null;
  disponible: boolean;
  registradoEn: Date;
}

/**
 * La consulta pide los últimos 500 puntos del más reciente al más antiguo;
 * aquí se invierte el orden y se normaliza a ISO para que la serie que pinta
 * la web quede en orden cronológico ascendente.
 */
export function formatearPuntosPrecio(filas: FilaPrecio[]): PuntoPrecio[] {
  return [...filas].reverse().map((f) => ({
    numeroTren: f.numeroTren,
    salida: f.salida,
    precioMin: f.precioMin,
    disponible: f.disponible,
    registradoEn: f.registradoEn.toISOString(),
  }));
}
