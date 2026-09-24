import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { getPrisma } from '@mantirenfe/database';
import {
  AlertaResponse,
  COLA_SONDEO,
  CrearAlertaInput,
  ActualizarAlertaInput,
} from '@mantirenfe/shared-types';
import { UsuarioRequest } from '../common/usuario-actual.decorator';

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
  intervaloSondeoMin: number;
  bono: string;
  notas: string | null;
  ultimoSondeoEn: Date | null;
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
    intervaloSondeoMin: alerta.intervaloSondeoMin,
    bono: alerta.bono,
    notas: alerta.notas,
    ultimoSondeoEn: alerta.ultimoSondeoEn?.toISOString() ?? null,
    creadaEn: alerta.creadaEn.toISOString(),
  };
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

    const origen = await prisma.estacion.findFirst({
      where: { nombre: { contains: datos.origenNombre, mode: 'insensitive' } },
    });
    const destino = await prisma.estacion.findFirst({
      where: { nombre: { contains: datos.destinoNombre, mode: 'insensitive' } },
    });

    const alerta = await prisma.alerta.create({
      data: {
        usuarioId: usuario.sub,
        origenNombre: datos.origenNombre,
        destinoNombre: datos.destinoNombre,
        origenEstacionId: origen?.id ?? null,
        destinoEstacionId: destino?.id ?? null,
        fechaViaje: new Date(`${datos.fechaViaje}T00:00:00`),
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

    const alerta = await prisma.alerta.update({
      where: { id },
      data: {
        estado: datos.estado,
        intervaloSondeoMin: datos.intervaloSondeoMin,
        notas: datos.notas === undefined ? undefined : datos.notas,
      },
    });

    if (datos.estado === 'PAUSA' || datos.estado === 'COMPLETADA') {
      const jobs = await this.colaSondeo.getJobs(['delayed', 'waiting', 'prioritized']);
      await Promise.all(jobs.filter((job) => job.data?.alertaId === id).map((job) => job.remove()));
    } else if (datos.estado === 'ACTIVA') {
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
