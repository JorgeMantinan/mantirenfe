import { Injectable } from '@nestjs/common';
import { getPrisma } from '@mantirenfe/database';
import { EstacionResponse } from '@mantirenfe/shared-types';

@Injectable()
export class EstacionesService {
  async buscar(q?: string, limite = 20): Promise<EstacionResponse[]> {
    const prisma = getPrisma();
    const estaciones = await prisma.estacion.findMany({
      where: q
        ? {
            OR: [
              { nombre: { contains: q, mode: 'insensitive' } },
              { ciudad: { contains: q, mode: 'insensitive' } },
            ],
          }
        : undefined,
      orderBy: { nombre: 'asc' },
      take: Math.min(limite, 50),
    });
    return estaciones.map((e) => ({
      id: e.id,
      codigo: e.codigo,
      nombre: e.nombre,
      ciudad: e.ciudad,
      latitud: e.latitud,
      longitud: e.longitud,
    }));
  }
}
