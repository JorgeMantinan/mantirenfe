import type { FuenteDatosTren } from './tipos';
import { FuenteMock } from './mock';
import { FuenteRenfeDwr } from './renfe-dwr';

export function crearFuenteDatos(): FuenteDatosTren {
  const nombre = process.env.FUENTE_DISPONIBILIDAD ?? 'mock';
  if (nombre === 'dwr') return new FuenteRenfeDwr();
  return new FuenteMock();
}
