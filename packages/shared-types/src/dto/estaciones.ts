export interface EstacionResponse {
  id: string;
  codigo: string;
  nombre: string;
  ciudad: string | null;
  latitud: number | null;
  longitud: number | null;
}

export interface BuscarEstacionesQuery {
  q?: string;
  limite?: number;
}
