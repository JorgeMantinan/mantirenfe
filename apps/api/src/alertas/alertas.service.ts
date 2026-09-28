import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { buscarEstaciones, getPrisma, Prisma } from '@mantirenfe/database';
import {
  AlertaResponse,
  COLA_SONDEO,
  CrearAlertaInput,
  ActualizarAlertaInput,
  type AvisoAlertaResponse,
  type EstadoSerializado,
  type PuntoPrecio,
} from '@mantirenfe/shared-types';
import { UsuarioRequest } from '../common/usuario-actual.decorator';
import { juntarConteoAvisos, formatearAvisos } from './avisos';
import { formatearPuntosPrecio } from './precios';

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
    const estaciones = Array.isArray(t.paradasSuprimidas)
      ? t.paradasSuprimidas.filter((nombre): nombre is string => typeof nombre === 'string')
      : [];
    trenes.push({
      trenId: t.trenId,
      numeroTren: typeof t.numeroTren === 'string' ? t.numeroTren : '',
      salida: t.salida,
      disponible: t.disponible,
      precioMin: typeof t.precioMin === 'number' ? t.precioMin : null,
      retrasoSeg: typeof t.retrasoSeg === 'number' ? t.retrasoSeg : null,
      cancelado: t.cancelado === true,
      ...(estaciones.length > 0 ? { paradasSuprimidas: estaciones } : {}),
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
  precioObjetivo: number | null;
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
    precioObjetivo: alerta.precioObjetivo,
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
    const prisma = getPrisma();
    const alertas = await prisma.alerta.findMany({
      where: { usuarioId: usuario.sub },
      orderBy: { creadaEn: 'desc' },
    });
    if (alertas.length === 0) return [];

    // Una única query agregada por alerta (sin N+1): cuántos avisos ha dado
    // cada una. Solo se piden los ids del listado, ya filtrados por usuario.
    const conteos = await prisma.notificacion.groupBy({
      by: ['alertaId'],
      where: { usuarioId: usuario.sub, alertaId: { in: alertas.map((a) => a.id) } },
      _count: { _all: true },
    });

    return juntarConteoAvisos(
      alertas.map(formatearAlerta),
      conteos.map((fila) => ({ alertaId: fila.alertaId, total: fila._count._all })),
    );
  }

  /**
   * Histórico reciente de avisos de una alerta: solo su dueño puede verlo. Se
   * devuelven sus últimas 50 notificaciones de la más reciente a la más antigua.
   */
  async avisos(usuario: UsuarioRequest, id: string): Promise<AvisoAlertaResponse[]> {
    const prisma = getPrisma();
    const alerta = await prisma.alerta.findFirst({
      where: { id, usuarioId: usuario.sub },
      select: { id: true },
    });
    if (!alerta) throw new NotFoundException('Alerta no encontrada');

    const filas = await prisma.notificacion.findMany({
      where: { alertaId: id, usuarioId: usuario.sub },
      orderBy: { creadaEn: 'desc' },
      take: 50,
      select: {
        id: true,
        titulo: true,
        cuerpo: true,
        datos: true,
        leida: true,
        creadaEn: true,
      },
    });
    return formatearAvisos(filas);
  }

  async obtener(usuario: UsuarioRequest, id: string): Promise<AlertaResponse> {
    const alerta = await getPrisma().alerta.findFirst({
      where: { id, usuarioId: usuario.sub },
    });
    if (!alerta) throw new NotFoundException('Alerta no encontrada');
    return formatearAlerta(alerta);
  }

  /**
   * Histórico de precios de la alerta: solo su dueño puede verlo. Se devuelven
   * los últimos 500 puntos en orden cronológico ascendente.
   */
  async precios(usuario: UsuarioRequest, id: string): Promise<PuntoPrecio[]> {
    const prisma = getPrisma();
    const alerta = await prisma.alerta.findFirst({
      where: { id, usuarioId: usuario.sub },
      select: { id: true },
    });
    if (!alerta) throw new NotFoundException('Alerta no encontrada');

    const filas = await prisma.precioTren.findMany({
      where: { alertaId: id },
      orderBy: { registradoEn: 'desc' },
      take: 500,
      select: {
        numeroTren: true,
        salida: true,
        precioMin: true,
        disponible: true,
        registradoEn: true,
      },
    });
    return formatearPuntosPrecio(filas);
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
        // El umbral solo aplica al criterio PRECIO: en el resto se ignora
        precioObjetivo: datos.criterio === 'PRECIO' ? (datos.precioObjetivo ?? null) : null,
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
      // Cambiar de criterio re-armaría el umbral: entrar en PRECIO exige objetivo
      // (lo garantiza el zod) y salir de PRECIO lo borra.
      data.precioObjetivo = datos.criterio === 'PRECIO' ? (datos.precioObjetivo ?? null) : null;
      cambioRuta = true;
    } else if (datos.precioObjetivo !== undefined && existente.criterio === 'PRECIO') {
      // Solo se toca el umbral si la alerta ya vigila precios; no resetea el
      // estado: el próximo sondeo re-evalúa el diff con el objetivo nuevo.
      data.precioObjetivo = datos.precioObjetivo;
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
