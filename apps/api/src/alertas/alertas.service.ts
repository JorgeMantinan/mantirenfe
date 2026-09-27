import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { buscarEstaciones, getPrisma, Prisma } from '@mantirenfe/database';
import {
  AlertaResponse,
  COLA_SONDEO,
  CrearAlertaInput,
  ActualizarAlertaInput,
  type EstadoSerializado,
} from '@mantirenfe/shared-types';
import { UsuarioRequest } from '../common/usuario-actual.decorator';

/**
 * `alerta.ultimoEstado` es un Json de Prisma: se normaliza para devolver solo
 * lo que la UI espera (y null si el worker aún no ha guardado nada).
 */
function formatearUltimoEstado(valor: unknown): EstadoSerializado[] | null {
  if (!Array.isArray(valor)) return null;
  const trenes: EstadoSerializado[] = [];
  for (const item of valor) {
    if (!item || typeof item !== 'object') continue;
    const t = item as Partial<EstadoSerializado>;
    if (typeof t.trenId !== 'string' || typeof t.salida !== 'string') continue;
    if (typeof t.disponible !== 'boolean') continue;
    trenes.push({
      trenId: t.trenId,
      numeroTren: typeof t.numeroTren === 'string' ? t.numeroTren : '',
      salida: t.salida,
      disponible: t.disponible,
      precioMin: typeof t.precioMin === 'number' ? t.precioMin : null,
      retrasoSeg: typeof t.retrasoSeg === 'number' ? t.retrasoSeg : null,
    });
  }
  return trenes;
}

function formatearAlerta(alerta: {
  id: string;
  origenNombre: string;
  destinoNombre: string;
  fechaViaje: Date;
  horaDesde: string | null;
  horaHasta: string | null;
  numeroTren: string | null;
  criterio: string;
  estado: string;
  recurrente: boolean;
  soloLaborables: boolean;
  intervaloSondeoMin: number;
  bono: string;
  notas: string | null;
  ultimoSondeoEn: Date | null;
  ultimoEstado?: unknown;
  creadaEn: Date;
}): AlertaResponse {
  return {
    id: alerta.id,
    origenNombre: alerta.origenNombre,
    destinoNombre: alerta.destinoNombre,
    fechaViaje: alerta.fechaViaje.toISOString().slice(0, 10),
    horaDesde: alerta.horaDesde,
    horaHasta: alerta.horaHasta,
    numeroTren: alerta.numeroTren,
    criterio: alerta.criterio as AlertaResponse['criterio'],
    estado: alerta.estado as AlertaResponse['estado'],
    recurrente: alerta.recurrente,
    soloLaborables: alerta.soloLaborables,
    intervaloSondeoMin: alerta.intervaloSondeoMin,
    bono: alerta.bono,
    notas: alerta.notas,
    ultimoSondeoEn: alerta.ultimoSondeoEn?.toISOString() ?? null,
    ultimoEstado: formatearUltimoEstado(alerta.ultimoEstado),
    creadaEn: alerta.creadaEn.toISOString(),
  };
}

/** Fecha (YYYY-MM-DD) del día actual, la referencia de "hoy" del formulario. */
function hoyIso(): string {
  return new Date().toISOString().slice(0, 10);
}

@Injectable()
export class AlertasService {
  constructor(@InjectQueue(COLA_SONDEO) private readonly colaSondeo: Queue) {}

  async listar(usuario: UsuarioRequest): Promise<AlertaResponse[]> {
    const alertas = await getPrisma().alerta.findMany({
      where: { usuarioId: usuario.sub },
      orderBy: { creadaEn: 'desc' },
    });
    return alertas.map(formatearAlerta);
  }

  async obtener(usuario: UsuarioRequest, id: string): Promise<AlertaResponse> {
    const alerta = await getPrisma().alerta.findFirst({
      where: { id, usuarioId: usuario.sub },
    });
    if (!alerta) throw new NotFoundException('Alerta no encontrada');
    return formatearAlerta(alerta);
  }

  async crear(usuario: UsuarioRequest, datos: CrearAlertaInput): Promise<AlertaResponse> {
    const prisma = getPrisma();
    await prisma.usuario.upsert({
      where: { id: usuario.sub },
      update: {},
      create: { id: usuario.sub, email: usuario.email || `${usuario.sub}@placeholder` },
    });

    const [origen] = await buscarEstaciones(prisma, datos.origenNombre, 1);
    const [destino] = await buscarEstaciones(prisma, datos.destinoNombre, 1);

    // Trayecto cotidiano: la fecha del formulario se ignora y se ancla a hoy,
    // así ninguna query por fecha (barrido, sondeo) caduca nunca.
    const fechaViaje = datos.recurrente ? hoyIso() : datos.fechaViaje;

    const alerta = await prisma.alerta.create({
      data: {
        usuarioId: usuario.sub,
        origenNombre: datos.origenNombre,
        destinoNombre: datos.destinoNombre,
        origenEstacionId: origen?.id ?? null,
        destinoEstacionId: destino?.id ?? null,
        fechaViaje: new Date(`${fechaViaje}T00:00:00Z`),
        recurrente: datos.recurrente,
        // soloLaborables solo tiene sentido dentro de un trayecto recurrente
        soloLaborables: datos.recurrente && datos.soloLaborables,
        horaDesde: datos.horaDesde ?? null,
        horaHasta: datos.horaHasta ?? null,
        numeroTren: datos.numeroTren ?? null,
        criterio: datos.criterio,
        intervaloSondeoMin: datos.intervaloSondeoMin,
        bono: datos.bono,
        notas: datos.notas ?? null,
      },
    });

    await this.encolarSondeo(alerta.id);
    return formatearAlerta(alerta);
  }

  async actualizar(
    usuario: UsuarioRequest,
    id: string,
    datos: ActualizarAlertaInput,
  ): Promise<AlertaResponse> {
    const prisma = getPrisma();
    const existente = await prisma.alerta.findFirst({ where: { id, usuarioId: usuario.sub } });
    if (!existente) throw new NotFoundException('Alerta no encontrada');

    // Si cambia la ruta o el viaje, se re-resuelve la estación y se resetea el
    // estado para que el próximo sondeo no compare contra datos de otra ruta.
    const nuevaRuta: Record<string, unknown> = {};
    let cambioRuta = false;

    if (datos.origenNombre !== undefined && datos.origenNombre !== existente.origenNombre) {
      const [origen] = await buscarEstaciones(prisma, datos.origenNombre, 1);
      nuevaRuta.origenNombre = datos.origenNombre;
      nuevaRuta.origenEstacionId = origen?.id ?? null;
      cambioRuta = true;
    }
    if (datos.destinoNombre !== undefined && datos.destinoNombre !== existente.destinoNombre) {
      const [destino] = await buscarEstaciones(prisma, datos.destinoNombre, 1);
      nuevaRuta.destinoNombre = datos.destinoNombre;
      nuevaRuta.destinoEstacionId = destino?.id ?? null;
      cambioRuta = true;
    }
    if (datos.fechaViaje !== undefined) {
      nuevaRuta.fechaViaje = new Date(`${datos.fechaViaje}T00:00:00Z`);
      cambioRuta = true;
      // Se re-arman los avisos del día de viaje
      nuevaRuta.recordatorioEnviadoEn = null;
      nuevaRuta.resumenEnviadoEn = null;
      nuevaRuta.recordatorioTrenesEnviados = [];
    }
    if (datos.horaDesde !== undefined) {
      nuevaRuta.horaDesde = datos.horaDesde;
      cambioRuta = true;
    }
    if (datos.horaHasta !== undefined) {
      nuevaRuta.horaHasta = datos.horaHasta;
      cambioRuta = true;
    }
    if (datos.numeroTren !== undefined) {
      nuevaRuta.numeroTren = datos.numeroTren;
      cambioRuta = true;
    }

    const data: Record<string, unknown> = { ...nuevaRuta };
    if (datos.estado !== undefined) data.estado = datos.estado;
    if (datos.intervaloSondeoMin !== undefined) data.intervaloSondeoMin = datos.intervaloSondeoMin;
    if (datos.notas !== undefined) data.notas = datos.notas;
    if (datos.criterio !== undefined) {
      data.criterio = datos.criterio;
      cambioRuta = true;
    }
    if (datos.bono !== undefined) data.bono = datos.bono;
    if (datos.recurrente !== undefined || datos.soloLaborables !== undefined) {
      const recurrente = datos.recurrente ?? existente.recurrente;
      const soloLaborables = datos.soloLaborables ?? existente.soloLaborables;
      data.recurrente = recurrente;
      data.soloLaborables = recurrente && soloLaborables;
      if (recurrente) {
        // El trayecto cotidiano se ancla a hoy: la fecha dejó de ser relevante
        data.fechaViaje = new Date(`${hoyIso()}T00:00:00Z`);
      }
      // Frecuencia nueva: se re-arman los avisos del día (igual que un cambio de ruta)
      data.recordatorioEnviadoEn = null;
      data.resumenEnviadoEn = null;
      data.recordatorioTrenesEnviados = [];
      cambioRuta = true;
    }
    if (cambioRuta) {
      data.ultimoEstado = Prisma.JsonNull;
      data.ultimoSondeoEn = null;
      // Cambió el alcance: los servicios ya recordados podrían no aplicar
      data.recordatorioTrenesEnviados = [];
    }

    const alerta = await prisma.alerta.update({
      where: { id },
      data: data as never,
    });

    if (datos.estado === 'PAUSA' || datos.estado === 'COMPLETADA') {
      const jobs = await this.colaSondeo.getJobs(['delayed', 'waiting', 'prioritized']);
      await Promise.all(jobs.filter((job) => job.data?.alertaId === id).map((job) => job.remove()));
    } else if (datos.estado === 'ACTIVA' || cambioRuta) {
      await this.encolarSondeo(id);
    }

    return formatearAlerta(alerta);
  }

  async eliminar(usuario: UsuarioRequest, id: string): Promise<void> {
    const prisma = getPrisma();
    const existente = await prisma.alerta.findFirst({ where: { id, usuarioId: usuario.sub } });
    if (!existente) throw new NotFoundException('Alerta no encontrada');
    await prisma.alerta.delete({ where: { id } });
    const jobs = await this.colaSondeo.getJobs(['delayed', 'waiting', 'prioritized']);
    await Promise.all(jobs.filter((job) => job.data?.alertaId === id).map((job) => job.remove()));
  }

  private async encolarSondeo(alertaId: string) {
    if (!process.env.REDIS_URL && process.env.NODE_ENV === 'production') {
      throw new BadRequestException('Redis no configurado');
    }
    try {
      await this.colaSondeo.add(
        'sondeo',
        { alertaId },
        {
          jobId: `sondeo-${alertaId}-${Date.now()}`,
          removeOnComplete: 100,
          removeOnFail: 500,
          attempts: 3,
          backoff: { type: 'exponential', delay: 5_000 },
        },
      );
    } catch {
      // Redis no disponible en desarrollo: el sweep masivo del worker se encargará
    }
  }
}
