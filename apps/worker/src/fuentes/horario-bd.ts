import type {
  ConsultaDisponibilidad,
  EstadoDisponibilidad,
  EstadoTrenDisponible,
} from '@mantirenfe/shared-types';
import { cruzarConexiones, type TramoHorario } from '@mantirenfe/shared-types';
import { buscarEstaciones, getPrisma } from '@mantirenfe/database';
import type { FuenteDatosTren } from './tipos';

export interface HorarioBd {
  numeroTren: string;
  salida: Date;
}

/**
 * Estado de horarios desde los datos GTFS sincronizados en la BD.
 * El trenId es solo el numeroTren (sin la hora): así `diffHorarios` detecta
 * como "cambiado" un tren cuya hora se mueve en el resync nocturno GTFS.
 */
export function construirEstadoHorario(
  consulta: ConsultaDisponibilidad,
  horarios: HorarioBd[],
): EstadoDisponibilidad {
  const trenes: EstadoTrenDisponible[] = horarios.map((h) => ({
    trenId: h.numeroTren,
    numeroTren: h.numeroTren,
    salida: h.salida.toISOString(),
    disponible: true,
    precioMin: null,
    moneda: 'EUR',
  }));
  return { consulta, trenes, consultadoEn: new Date().toISOString() };
}

export class FuenteHorarioBd implements FuenteDatosTren {
  readonly nombre = 'horario-bd';

  async getDisponibilidad(consulta: ConsultaDisponibilidad): Promise<EstadoDisponibilidad> {
    const prisma = getPrisma();
    const [estacionesOrigen, estacionesDestino] = await Promise.all([
      buscarEstaciones(prisma, consulta.origenNombre, 20),
      buscarEstaciones(prisma, consulta.destinoNombre, 20),
    ]);
    if (estacionesOrigen.length === 0 || estacionesDestino.length === 0) {
      return construirEstadoHorario(consulta, []);
    }

    const horarios = await prisma.horarioTren.findMany({
      where: {
        origenEstacionId: { in: estacionesOrigen.map((e) => e.id) },
        destinoEstacionId: { in: estacionesDestino.map((e) => e.id) },
        fecha: new Date(`${consulta.fecha}T00:00:00Z`),
        ...(consulta.numeroTren ? { numeroTren: consulta.numeroTren } : {}),
      },
      orderBy: { salida: 'asc' },
      take: 300,
      select: { numeroTren: true, salida: true },
    });
    if (horarios.length > 0 || consulta.numeroTren) {
      return construirEstadoHorario(consulta, horarios);
    }

    // Sin tren directo (ej. A Coruña → Valencia): se evalúa con 1 transbordo
    const idsOrigen = estacionesOrigen.map((e) => e.id);
    const idsDestino = estacionesDestino.map((e) => e.id);
    const selectTramo = {
      numeroTren: true,
      salida: true,
      llegada: true,
      operador: true,
      origenEstacionId: true,
      destinoEstacionId: true,
      origen: { select: { nombre: true } },
      destino: { select: { nombre: true } },
    } as const;
    const [salientes, entrantes] = await Promise.all([
      prisma.horarioTren.findMany({
        where: {
          origenEstacionId: { in: idsOrigen },
          destinoEstacionId: { notIn: idsDestino },
          fecha: new Date(`${consulta.fecha}T00:00:00Z`),
        },
        orderBy: { salida: 'asc' },
        take: 400,
        select: selectTramo,
      }),
      prisma.horarioTren.findMany({
        where: {
          destinoEstacionId: { in: idsDestino },
          origenEstacionId: { notIn: idsOrigen },
          fecha: new Date(`${consulta.fecha}T00:00:00Z`),
        },
        orderBy: { salida: 'asc' },
        take: 400,
        select: selectTramo,
      }),
    ]);
    const aTramo = (h: (typeof salientes)[number]): TramoHorario => ({
      numeroTren: h.numeroTren,
      origenNombre: h.origen.nombre,
      destinoNombre: h.destino.nombre,
      origenEstacionId: h.origenEstacionId,
      destinoEstacionId: h.destinoEstacionId,
      salida: h.salida,
      llegada: h.llegada,
      operador: h.operador,
    });
    const conexiones = cruzarConexiones(salientes.map(aTramo), entrantes.map(aTramo), 10);
    return construirEstadoHorario(
      consulta,
      conexiones.map((c) => ({
        numeroTren: `${c.primera.numeroTren} + ${c.segunda.numeroTren}`,
        salida: c.primera.salida,
      })),
    );
  }
}
