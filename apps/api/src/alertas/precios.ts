import { horaComoTexto, type PuntoPrecio } from '@mantirenfe/shared-types';

/** Fila de `PrecioTren` tal y como sale de Prisma. */
export interface FilaPrecio {
  numeroTren: string;
  /** Columna `@db.Time`: Prisma entrega un Date (1970-01-01 + hora en UTC). */
  salida: Date;
  precioMin: number | null;
  disponible: boolean;
  registradoEn: Date;
}

/**
 * La consulta pide los últimos 500 puntos del más reciente al más antiguo;
 * aquí se invierte el orden y se normaliza a ISO para que la serie que pinta
 * la web quede en orden cronológico ascendente.
 *
 * `PuntoPrecio.salida` sigue siendo `'HH:MM'` (el DTO NO cambia): la columna
 * pasó a `@db.Time`, así que el texto se formatea aquí, en el borde de Prisma.
 */
export function formatearPuntosPrecio(filas: FilaPrecio[]): PuntoPrecio[] {
  return [...filas].reverse().map((f) => ({
    numeroTren: f.numeroTren,
    // `salida` es NOT NULL y siempre HH:MM en la BD; el `??` solo cubre un Date
    // inválido (nunca se ha dado) para no romper el DTO.
    salida: horaComoTexto(f.salida) ?? '00:00',
    precioMin: f.precioMin,
    disponible: f.disponible,
    registradoEn: f.registradoEn.toISOString(),
  }));
}
