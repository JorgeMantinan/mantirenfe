import type { AvisoAlertaResponse } from '@mantirenfe/shared-types';

/** Fila que devuelve `groupBy` sobre `Notificacion` (recuento por alerta). */
export interface ConteoAvisos {
  alertaId: string | null;
  total: number;
}

/** Fila de `Notificacion` tal y como sale de Prisma (selección del histórico). */
export interface FilaAviso {
  id: string;
  titulo: string;
  cuerpo: string;
  datos: unknown;
  leida: boolean;
  creadaEn: Date;
}

/**
 * Une el único `groupBy(Notificacion)` con el listado de alertas ya formateado:
 * las alertas sin avisos quedan a 0 y los conteos de alertas que no están en la
 * lista se ignoran, de modo que la respuesta no depende del orden de las filas.
 */
export function juntarConteoAvisos<T extends { id: string }>(
  alertas: T[],
  conteos: ConteoAvisos[],
): (T & { avisosRecibidos: number })[] {
  const porAlerta = new Map<string, number>();
  for (const fila of conteos) {
    if (fila.alertaId) porAlerta.set(fila.alertaId, fila.total);
  }
  return alertas.map((alerta) => ({
    ...alerta,
    avisosRecibidos: porAlerta.get(alerta.id) ?? 0,
  }));
}

/** Normaliza las filas al DTO: el Json de `datos` a objeto y la fecha a ISO. */
export function formatearAvisos(filas: FilaAviso[]): AvisoAlertaResponse[] {
  return filas.map((fila) => ({
    id: fila.id,
    titulo: fila.titulo,
    cuerpo: fila.cuerpo,
    datos: (fila.datos as Record<string, unknown> | null) ?? null,
    leida: fila.leida,
    creadaEn: fila.creadaEn.toISOString(),
  }));
}
