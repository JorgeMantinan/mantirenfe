export interface IncidenciaResponse {
  id: string;
  titulo: string | null;
  mensaje: string | null;
  causa: string | null;
  estacionesAfectadas: string[];
  desde: string | null;
  hasta: string | null;
  activa: boolean;
  actualizadaEn: string;
}

// El cruce incidencia ↔ alerta vive en shared-types (lo usa también el worker
// para decidir a quién avisa); aquí solo se reexporta para la web.
export { incidenciaAfectaA, normalizarTexto } from '@mantirenfe/shared-types';

function formatoFecha(valor: string): string {
  return new Date(valor).toLocaleString('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatoPeriodo(desde: string | null, hasta: string | null): string {
  if (desde && hasta) return `${formatoFecha(desde)} – ${formatoFecha(hasta)}`;
  if (desde) return `Desde el ${formatoFecha(desde)}`;
  if (hasta) return `Hasta el ${formatoFecha(hasta)}`;
  return 'Periodo no indicado';
}
