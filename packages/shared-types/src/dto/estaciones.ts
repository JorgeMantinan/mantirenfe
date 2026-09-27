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

/** Volumen de viajeros de una franja horaria (fuente: data.renfe.com, 2018). */
export interface AforoHistoricoResponse {
  franja: string;
  subidos: number;
  bajados: number;
  anio: number;
}

/**
 * Ficha de estación enriquecida con el listado oficial de data.renfe.com y los
 * aforos históricos. Los campos de la fuente oficial son `null` cuando no
 * existen o cuando el CKAN de Renfe no responde (el endpoint nunca falla).
 */
export interface EstacionDetalleResponse {
  id: string;
  codigo: string;
  nombre: string;
  ciudad: string | null;
  latitud: number | null;
  longitud: number | null;
  direccion: string | null;
  cp: string | null;
  poblacion: string | null;
  provincia: string | null;
  /** No se expone: las fichas PDF viven en renfe.com y no enlazamos a ese dominio. */
  fichaPdfUrl: string | null;
  /** `null` cuando la estación no tiene aforos publicados (p. ej. no es de cercanías). */
  aforos: AforoHistoricoResponse[] | null;
}
