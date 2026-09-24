import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { getPrisma } from '@mantirenfe/database';
import {
  busquedaHorariosQuerySchema,
  HorarioTrenResponse,
  PosicionTrenResponse,
} from '@mantirenfe/shared-types';

interface PosicionCruda {
  id: string;
  numeroTren: string | null;
  latitud: number;
  longitud: number;
  velocidadKmh: number | null;
  retrasoSeg: number | null;
}

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

    const estacionOrigen = await prisma.estacion.findFirst({
      where: { nombre: { contains: origen, mode: 'insensitive' } },
    });
    const estacionDestino = await prisma.estacion.findFirst({
      where: { nombre: { contains: destino, mode: 'insensitive' } },
    });

    if (!estacionOrigen || !estacionDestino) {
      return { fuente: 'cache', trenes: [] };
    }

    const horarios = await prisma.horarioTren.findMany({
      where: {
        origenEstacionId: estacionOrigen.id,
        destinoEstacionId: estacionDestino.id,
        fecha: new Date(`${fecha}T00:00:00`),
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

      const resultados = await Promise.allSettled(urls.map((url) => this.obtenerFeed(url)));
      const crudas: PosicionCruda[] = [];
      for (const resultado of resultados) {
        if (resultado.status === 'fulfilled') crudas.push(...resultado.value);
      }

      const datos: PosicionTrenResponse[] = crudas.map((p) => ({
        ...p,
        actualizadaEn: new Date().toISOString(),
      }));

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
          retrasoSeg: null,
        });
      }
      return crudas;
    } finally {
      clearTimeout(timeout);
    }
  }
}
