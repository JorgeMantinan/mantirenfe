import type { Logger } from 'pino';
import { buscarEstaciones, getPrisma } from '@mantirenfe/database';
import {
  parsearCancelados,
  parsearParadasSuprimidas,
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
  /** Estaciones del trayecto, para cruzar las paradas suprimidas (GTFS-RT SKIPPED) */
  origenEstacionId?: string;
  destinoEstacionId?: string;
}

export function construirEstadoRetrasos(
  consulta: ConsultaDisponibilidad,
  horarios: HorarioRetraso[],
  retrasos: ReadonlyMap<string, number>,
  cancelados: ReadonlySet<string> = new Set(),
  paradasSuprimidas: ReadonlyMap<string, readonly string[]> = new Map(),
): EstadoDisponibilidad {
  const trenes: EstadoTrenDisponible[] = horarios.map((h) => {
    const estaciones = paradasSuprimidas.get(h.numeroTren) ?? [];
    return {
      trenId: h.numeroTren,
      numeroTren: h.numeroTren,
      salida: h.salida.toISOString(),
      disponible: true,
      precioMin: null,
      moneda: 'EUR',
      retrasoSeg: retrasos.get(h.numeroTren) ?? null,
      cancelado: cancelados.has(h.numeroTren),
      ...(estaciones.length > 0 ? { paradasSuprimidas: [...estaciones] } : {}),
    };
  });
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
      select: {
        numeroTren: true,
        salida: true,
        origenEstacionId: true,
        destinoEstacionId: true,
      },
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
    const cancelados = new Set<string>();
    const suprimidas = new Map<string, string[]>();
    for (const feed of feeds) {
      for (const [clave, delay] of parsearRetrasos(feed, tripIds)) {
        const previo = retrasos.get(clave);
        if (previo === undefined || delay > previo) retrasos.set(clave, delay);
      }
      for (const clave of parsearCancelados(feed, tripIds)) cancelados.add(clave);
      for (const { tripId, stopIds } of parsearParadasSuprimidas(feed, tripIds)) {
        const previos = suprimidas.get(tripId) ?? [];
        for (const stopId of stopIds) if (!previos.includes(stopId)) previos.push(stopId);
        suprimidas.set(tripId, previos);
      }
    }
    const paradasSuprimidas = paradasSuprimidasDeLaRuta(horarios, suprimidas, [
      ...estacionesOrigen,
      ...estacionesDestino,
    ]);
    return construirEstadoRetrasos(consulta, horarios, retrasos, cancelados, paradasSuprimidas);
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

/**
 * Cruza los `stopId` de las paradas suprimidas (SKIPPED) con las estaciones de
 * origen y destino de cada horario: en este feed los stopId son el `codigo` de
 * la tabla `Estacion` (mismo cruce que `informed_entity.stop_id` en incidencias).
 * Solo cuenta si el tren se salta una estación DE LA RUTA de la alerta; las
 * paradas intermedias se ignoran a propósito.
 */
export function paradasSuprimidasDeLaRuta(
  horarios: HorarioRetraso[],
  suprimidas: ReadonlyMap<string, readonly string[]>,
  estaciones: ReadonlyArray<{ id: string; codigo: string; nombre: string }>,
): Map<string, string[]> {
  const porId = new Map(estaciones.map((e) => [e.id, e]));
  const resultado = new Map<string, string[]>();

  for (const horario of horarios) {
    const stopIds = suprimidas.get(horario.numeroTren);
    if (!stopIds || stopIds.length === 0) continue;
    const nombres = new Set<string>();
    for (const id of [horario.origenEstacionId, horario.destinoEstacionId]) {
      const estacion = id ? porId.get(id) : undefined;
      if (estacion && stopIds.includes(estacion.codigo)) nombres.add(estacion.nombre);
    }
    if (nombres.size === 0) continue;
    const previos = resultado.get(horario.numeroTren) ?? [];
    for (const nombre of nombres) if (!previos.includes(nombre)) previos.push(nombre);
    resultado.set(horario.numeroTren, previos);
  }
  return resultado;
}
