import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { buscarEstaciones, getPrisma } from '@mantirenfe/database';
import {
  busquedaHorariosQuerySchema,
  HorarioTrenResponse,
  parsearRetrasos,
  PosicionTrenResponse,
} from '@mantirenfe/shared-types';
import { aplicarRetrasos, type PosicionCruda } from './retrasos';

interface CachePosiciones {
  datos: PosicionTrenResponse[];
  caduca: number;
}

@Injectable()
export class TrenesService {
  private readonly logger = new Logger(TrenesService.name);
  private cachePosiciones: CachePosiciones | null = null;
  private enCurso = false;

  async horarios(query: unknown): Promise<{ fuente: string; trenes: HorarioTrenResponse[] }> {
    const parsed = busquedaHorariosQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten().fieldErrors);
    }
    const { origen, destino, fecha } = parsed.data;
    const prisma = getPrisma();

    const [estacionesOrigen, estacionesDestino] = await Promise.all([
      buscarEstaciones(prisma, origen, 20),
      buscarEstaciones(prisma, destino, 20),
    ]);

    if (estacionesOrigen.length === 0 || estacionesDestino.length === 0) {
      return { fuente: 'cache', trenes: [] };
    }

    const horarios = await prisma.horarioTren.findMany({
      where: {
        origenEstacionId: { in: estacionesOrigen.map((e) => e.id) },
        destinoEstacionId: { in: estacionesDestino.map((e) => e.id) },
        fecha: new Date(`${fecha}T00:00:00Z`),
      },
      orderBy: { salida: 'asc' },
      take: 50,
      include: { origen: true, destino: true },
    });

    return {
      fuente: 'cache',
      trenes: horarios.map((h) => {
        const salida = h.salida;
        const llegada = h.llegada;
        return {
          numeroTren: h.numeroTren,
          origenNombre: h.origen.nombre,
          destinoNombre: h.destino.nombre,
          salida: salida.toISOString(),
          llegada: llegada.toISOString(),
          duracionMin: Math.round((llegada.getTime() - salida.getTime()) / 60_000),
          operador: h.operador,
        };
      }),
    };
  }

  async posiciones(): Promise<{ fuente: string; trenes: PosicionTrenResponse[]; total: number }> {
    const ttl = 15_000;
    if (this.cachePosiciones && this.cachePosiciones.caduca > Date.now()) {
      return {
        fuente: 'gtfs-rt',
        trenes: this.cachePosiciones.datos,
        total: this.cachePosiciones.datos.length,
      };
    }
    if (this.enCurso) {
      return {
        fuente: 'gtfs-rt',
        trenes: this.cachePosiciones?.datos ?? [],
        total: this.cachePosiciones?.datos.length ?? 0,
      };
    }

    this.enCurso = true;
    try {
      const urls = (process.env.GTFS_RT_URLS ?? 'https://gtfsrt.renfe.com/vehicle_positions.json')
        .split(',')
        .map((u) => u.trim())
        .filter(Boolean);
      const urlRetrasos =
        process.env.GTFS_RT_TRIP_UPDATES_URL?.trim() ??
        'https://gtfsrt.renfe.com/trip_updates.json';

      const [resultados, retrasos] = await Promise.all([
        Promise.allSettled(urls.map((url) => this.obtenerFeed(url))),
        this.obtenerRetrasos(urlRetrasos),
      ]);
      const crudas: PosicionCruda[] = [];
      for (const resultado of resultados) {
        if (resultado.status === 'fulfilled') crudas.push(...resultado.value);
      }

      const datos = aplicarRetrasos(crudas, retrasos, new Date().toISOString());

      this.cachePosiciones = { datos, caduca: Date.now() + ttl };
      return { fuente: 'gtfs-rt', trenes: datos, total: datos.length };
    } catch (error) {
      this.logger.warn(`No se pudieron obtener posiciones GTFS-RT: ${String(error)}`);
      return {
        fuente: 'gtfs-rt',
        trenes: this.cachePosiciones?.datos ?? [],
        total: this.cachePosiciones?.datos.length ?? 0,
      };
    } finally {
      this.enCurso = false;
    }
  }

  private async obtenerRetrasos(url: string): Promise<Map<string, number>> {
    const controlador = new AbortController();
    const timeout = setTimeout(() => controlador.abort(), 8_000);
    try {
      const respuesta = await fetch(url, {
        signal: controlador.signal,
        headers: { accept: 'application/json' },
      });
      if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);
      return parsearRetrasos(await respuesta.json());
    } catch (error) {
      this.logger.warn(`No se pudieron obtener retrasos GTFS-RT: ${String(error)}`);
      return new Map();
    } finally {
      clearTimeout(timeout);
    }
  }

  private async obtenerFeed(url: string): Promise<PosicionCruda[]> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8_000);
    try {
      const respuesta = await fetch(url, {
        signal: controller.signal,
        headers: { accept: 'application/json' },
      });
      if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);
      const feed = (await respuesta.json()) as {
        entity?: Array<{
          id?: string;
          vehicle?: {
            position?: { latitude?: number; longitude?: number; speed?: number };
            timestamp?: number;
            trip?: { tripId?: string };
            vehicle?: { label?: string; id?: string };
          };
        }>;
      };

      const crudas: PosicionCruda[] = [];
      for (const entity of feed.entity ?? []) {
        const vehicle = entity.vehicle;
        const position = vehicle?.position;
        if (!position || position.latitude == null || position.longitude == null) continue;
        crudas.push({
          id: vehicle.vehicle?.id ?? vehicle.trip?.tripId ?? entity.id ?? crypto.randomUUID(),
          numeroTren: vehicle.vehicle?.label ?? vehicle.trip?.tripId ?? null,
          latitud: position.latitude,
          longitud: position.longitude,
          velocidadKmh:
            position.speed != null && position.speed >= 0
              ? Math.round(position.speed * 3.6 * 10) / 10
              : null,
          tripId: vehicle.trip?.tripId ?? null,
        });
      }
      return crudas;
    } finally {
      clearTimeout(timeout);
    }
  }
}
