import { Injectable } from '@nestjs/common';
import type { Incidencia } from '@prisma/client';
import { getPrisma } from '@mantirenfe/database';

@Injectable()
export class IncidenciasService {
  /** Incidencias activas del feed GTFS-RT, de más antigua a más reciente. */
  async activas(): Promise<Incidencia[]> {
    return getPrisma().incidencia.findMany({
      where: { activa: true },
      // Más nuevas primero (las nulas, al final): el usuario lee de arriba abajo.
      orderBy: [{ desde: { sort: 'desc', nulls: 'last' } }, { actualizadaEn: 'desc' }],
      // Red de seguridad (medido: 73 activas de 214 históricas)
      take: 500,
    });
  }
}
