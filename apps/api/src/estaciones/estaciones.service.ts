import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { buscarEstaciones, getPrisma } from '@mantirenfe/database';
import type { Estacion } from '@prisma/client';
import { EstacionDetalleResponse, EstacionResponse } from '@mantirenfe/shared-types';
import { obtenerAforos, obtenerFichaOficial } from './renfe-datos';

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

  /**
   * Ficha de una estación con los datos oficiales de data.renfe.com y, si la
   * estación los tiene, los aforos por franja horaria de 2018. Un fallo del
   * CKAN deja los campos en `null`: nunca convierte la petición en un 500.
   */
  async detalle(codigo?: string, q?: string): Promise<EstacionDetalleResponse> {
    const estacion = await this.resolver(codigo, q);
    if (!estacion) {
      throw new NotFoundException(
        codigo
          ? `No encontramos ninguna estación con el código ${codigo}`
          : 'Estación no encontrada',
      );
    }

    const [ficha, aforos] = await Promise.all([
      obtenerFichaOficial(estacion.codigo, estacion.nombre),
      obtenerAforos(estacion.codigo, estacion.nombre),
    ]);

    return {
      id: estacion.id,
      codigo: estacion.codigo,
      nombre: estacion.nombre,
      ciudad: estacion.ciudad,
      // La BD (GTFS) manda; el listado oficial cubre lo que falte.
      latitud: estacion.latitud ?? ficha?.latitud ?? null,
      longitud: estacion.longitud ?? ficha?.longitud ?? null,
      direccion: ficha?.direccion ?? null,
      cp: ficha?.cp ?? null,
      poblacion: ficha?.poblacion ?? null,
      provincia: ficha?.provincia ?? null,
      // No hay ninguna ficha PDF en data.renfe.com (el dataset solo publica
      // CSV/XLSX) y no enlazamos a renfe.com: el campo queda en null.
      fichaPdfUrl: null,
      aforos: aforos && aforos.length > 0 ? aforos : null,
    };
  }

  /** `?codigo=` exacto primero; si no, el mismo fuzzy que el buscador (`?q=`). */
  private async resolver(codigo?: string, q?: string): Promise<Estacion | null> {
    const codigoLimpio = codigo?.trim();
    const texto = codigoLimpio || q?.trim();
    if (!texto) throw new BadRequestException('Indica el parámetro código o q');

    if (codigoLimpio) {
      const estacion = await getPrisma().estacion.findUnique({ where: { codigo: codigoLimpio } });
      if (estacion) return estacion;
    }

    const candidatas = await buscarEstaciones(getPrisma(), texto, 1);
    return candidatas[0] ?? null;
  }
}
