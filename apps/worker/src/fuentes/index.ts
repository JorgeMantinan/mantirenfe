import type { FuenteDatosTren } from './tipos';
import { FuenteMock } from './mock';
import { FuenteRenfeDwr } from './renfe-dwr';
import { FuenteGtfsRt } from './gtfs-rt';
import { FuenteHorarioBd } from './horario-bd';

export function crearFuenteDatos(criterio?: string): FuenteDatosTren {
  if (criterio === 'RETRASO') return new FuenteGtfsRt();
  if (criterio === 'HORARIO') return new FuenteHorarioBd();
  const nombre = process.env.FUENTE_DISPONIBILIDAD ?? 'mock';
  if (nombre === 'dwr') return new FuenteRenfeDwr();
  return new FuenteMock();
}
