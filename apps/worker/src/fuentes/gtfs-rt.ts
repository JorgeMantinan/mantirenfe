import type { Logger } from 'pino';
import { buscarEstaciones, getPrisma } from '@mantirenfe/database';
import {
  parsearRetrasos,
  type ConsultaDisponibilidad,
  type EstadoDisponibilidad,
  type EstadoTrenDisponible,
} from '@mantirenfe/shared-types';
import type { FuenteDatosTren } from './tipos';

const URL_TRIP_UPDATES_DEFECTO =
  'https://gtfsrt.renfe.com/trip_updates.json,https://gtfsrt.renfe.com/trip_updates_LD.json';

export interface HorarioRetraso {
  numeroTren: string;
  salida: Date;
}

export function construirEstadoRetrasos(
  consulta: ConsultaDisponibilidad,
  horarios: HorarioRetraso[],
  retrasos: ReadonlyMap<string, number>,
): EstadoDisponibilidad {
  const trenes: EstadoTrenDisponible[] = horarios.map((h) => ({
    trenId: h.numeroTren,
    numeroTren: h.numeroTren,
    salida: h.salida.toISOString(),
    disponible: true,
    precioMin: null,
    moneda: 'EUR',
    retrasoSeg: retrasos.get(h.numeroTren) ?? null,
  }));
  return { consulta, trenes, consultadoEn: new Date().toISOString() };
}

export class FuenteGtfsRt implements FuenteDatosTren {
  readonly nombre = 'gtfs-rt';

  constructor(private readonly logger?: Logger) {}

  async getDisponibilidad(consulta: ConsultaDisponibilidad): Promise<EstadoDisponibilidad> {
    const prisma = getPrisma();
    const [estacionesOrigen, estacionesDestino] = await Promise.all([
      buscarEstaciones(prisma, consulta.origenNombre, 20),
      buscarEstaciones(prisma, consulta.destinoNombre, 20),
    ]);
    if (estacionesOrigen.length === 0 || estacionesDestino.length === 0) {
      this.logger?.warn(
        { origen: consulta.origenNombre, destino: consulta.destinoNombre },
        'Estaciones no encontradas para el sondeo de retrasos',
      );
      return construirEstadoRetrasos(consulta, [], new Map());
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
    if (horarios.length === 0) {
      return construirEstadoRetrasos(consulta, [], new Map());
    }

    const urls = (process.env.GTFS_RT_TRIP_UPDATES_URL?.trim() || URL_TRIP_UPDATES_DEFECTO)
      .split(',')
      .map((u) => u.trim())
      .filter(Boolean);
    const tripIds = new Set(horarios.map((h) => h.numeroTren));
    const feeds = await Promise.all(urls.map((u) => this.descargarFeed(u)));
    const retrasos = new Map<string, number>();
    for (const feed of feeds) {
      for (const [clave, delay] of parsearRetrasos(feed, tripIds)) {
        const previo = retrasos.get(clave);
        if (previo === undefined || delay > previo) retrasos.set(clave, delay);
      }
    }
    return construirEstadoRetrasos(consulta, horarios, retrasos);
  }

  private async descargarFeed(url: string): Promise<unknown> {
    const controlador = new AbortController();
    const timeout = setTimeout(() => controlador.abort(), 10_000);
    try {
      const respuesta = await fetch(url, {
        signal: controlador.signal,
        headers: { accept: 'application/json' },
      });
      if (!respuesta.ok) throw new Error(`GTFS_RT_HTTP_${respuesta.status}`);
      return await respuesta.json();
    } finally {
      clearTimeout(timeout);
    }
  }
}
