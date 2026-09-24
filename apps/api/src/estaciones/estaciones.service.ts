import { Injectable } from '@nestjs/common';
import { buscarEstaciones, getPrisma } from '@mantirenfe/database';
import { EstacionResponse } from '@mantirenfe/shared-types';

@Injectable()
export class EstacionesService {
  async buscar(q?: string, limite = 20): Promise<EstacionResponse[]> {
    const prisma = getPrisma();
    const tope = Math.min(limite, 50);
    const estaciones = q
      ? await buscarEstaciones(prisma, q, tope)
      : await prisma.estacion.findMany({ orderBy: { nombre: 'asc' }, take: tope });
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
