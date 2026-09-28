import type { FuenteDatosTren } from './tipos';
import { FuenteMock } from './mock';
import { FuenteRenfeDwr } from './renfe-dwr';
import { FuenteGtfsRt } from './gtfs-rt';
import { FuenteHorarioBd } from './horario-bd';

export function crearFuenteDatos(criterio?: string): FuenteDatosTren {
  if (criterio === 'RETRASO') return new FuenteGtfsRt();
  if (criterio === 'HORARIO') return new FuenteHorarioBd();
  // DISPONIBILIDAD, APERTURA_VENTA y PRECIO comparten la fuente de venta: es la
  // única que trae `precioMin` (el umbral del criterio PRECIO se compara contra ella).
  // En producción se usan datos reales de la venta (dwr); en desarrollo, mock.
  // Se puede forzar con FUENTE_DISPONIBILIDAD=dwr|mock.
  const nombre =
    process.env.FUENTE_DISPONIBILIDAD ?? (process.env.NODE_ENV === 'production' ? 'dwr' : 'mock');
  if (nombre === 'dwr') return new FuenteRenfeDwr();
  return new FuenteMock();
}
