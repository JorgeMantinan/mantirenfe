import type { ConsultaDisponibilidad, EstadoDisponibilidad } from '@mantirenfe/shared-types';

export interface FuenteDatosTren {
  readonly nombre: string;
  getDisponibilidad(consulta: ConsultaDisponibilidad): Promise<EstadoDisponibilidad>;
}
