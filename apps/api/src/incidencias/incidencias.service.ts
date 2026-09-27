import { Injectable } from '@nestjs/common';
import type { Incidencia } from '@prisma/client';
import { getPrisma } from '@mantirenfe/database';

@Injectable()
export class IncidenciasService {
  /** Incidencias activas del feed GTFS-RT, de más antigua a más reciente. */
  async activas(): Promise<Incidencia[]> {
    return getPrisma().incidencia.findMany({
      where: { activa: true },
      orderBy: [{ desde: 'asc' }, { actualizadaEn: 'desc' }],
    });
  }
}
