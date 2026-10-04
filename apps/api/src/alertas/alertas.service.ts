import { Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { buscarEstaciones, getPrisma, Prisma } from '@mantirenfe/database';
import {
  AlertaResponse,
  COLA_SONDEO,
  CrearAlertaInput,
  ActualizarAlertaInput,
  DIAS_LABORABLES,
  HORIZONTE_FLEXIBLE_DIAS,
  fechaGtfs,
  fechaIso,
  normalizarDiasSemana,
  type AvisoAlertaResponse,
  type EstadoSerializado,
  type PuntoPrecio,
} from '@mantirenfe/shared-types';
import { UsuarioRequest } from '../common/usuario-actual.decorator';
import { asegurarUsuario } from '../common/utilidades';
import { juntarConteoAvisos, formatearAvisos } from './avisos';
import { formatearPuntosPrecio } from './precios';

/**
 * `alerta.ultimoEstado` es un Json de Prisma: se normaliza para devolver solo
 * lo que la UI espera (y null si el worker aún no ha guardado nada).
 *
 * Los campos de detalle (`tramo`, `conexionEn`, `conexionLlegada`,
 * `conexionSalida`, `esperaMin`, `horaLlegada`, `duracionMin`, `tipoTren`,
 * `tarifa`) son opcionales: se copian solo si traen el tipo esperado, para
 * tolerar estados guardados por versiones anteriores.
 */
export function formatearUltimoEstado(valor: unknown): EstadoSerializado[] | null {
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
      ...(t.tramo === 'directo' || t.tramo === 'conexion' ? { tramo: t.tramo } : {}),
      ...(textoPropio(t.conexionEn) ? { conexionEn: t.conexionEn } : {}),
      ...(textoPropio(t.conexionLlegada) ? { conexionLlegada: t.conexionLlegada } : {}),
      ...(textoPropio(t.conexionSalida) ? { conexionSalida: t.conexionSalida } : {}),
      ...(typeof t.esperaMin === 'number' && Number.isFinite(t.esperaMin)
        ? { esperaMin: t.esperaMin }
        : {}),
      ...(textoPropio(t.horaLlegada) ? { horaLlegada: t.horaLlegada } : {}),
      ...(typeof t.duracionMin === 'number' && Number.isFinite(t.duracionMin)
        ? { duracionMin: t.duracionMin }
        : {}),
      ...(textoPropio(t.tipoTren) ? { tipoTren: t.tipoTren } : {}),
      ...(textoPropio(t.tarifa) ? { tarifa: t.tarifa } : {}),
    });
  }
  return trenes;
}

/** Texto no vacío del Json de Prisma (los opcionales así se omiten si vienen mal). */
function textoPropio(valor: unknown): valor is string {
  return typeof valor === 'string' && valor !== '';
}

/** Suma días a una fecha `YYYY-MM-DD` sin depender de la zona horaria local. */
function sumarDias(fecha: string, dias: number): string {
  const [anio, mes, dia] = fecha.split('-').map(Number);
  return new Date(Date.UTC(anio ?? 1970, (mes ?? 1) - 1, (dia ?? 1) + dias))
    .toISOString()
    .slice(0, 10);
}

/**
 * Días aplicables canónicos (`diasSemana`) a partir de la entrada de un cliente.
 *
 * Solo hay UN formato en la base: este traductor absorbe el legado
 * `soloLaborables` (true = lunes a viernes) y fija "todos los días" para las
 * alertas no recurrentes (ellas van ancladas a su fecha).
 *
 * - Viene `diasSemana` (aunque sea `[]`) → manda él.
 * - Solo `soloLaborables` → `[1,2,3,4,5]` si está en true, `[]` si en false.
 * - Ninguno de los dos → el valor ya guardado (edición) o `[]` (alta).
 */
export function diasSemanaDe(
  datos: {
    recurrente: boolean;
    diasSemana?: number[] | undefined;
    soloLaborables?: boolean | undefined;
  },
  previo: readonly number[] = [],
): number[] {
  if (!datos.recurrente) return [];
  if (datos.diasSemana !== undefined) return normalizarDiasSemana(datos.diasSemana);
  if (datos.soloLaborables !== undefined) {
    return datos.soloLaborables ? normalizarDiasSemana(DIAS_LABORABLES) : [];
  }
  return normalizarDiasSemana(previo);
}

/** Espejo del formato legado: `soloLaborables` = "los días marcados son lun-vie". */
export function esSoloLaborables(dias: readonly number[]): boolean {
  return dias.length === DIAS_LABORABLES.length && DIAS_LABORABLES.every((d) => dias.includes(d));
}

/**
 * Rango del sondeo flexible (`fechaFlexible`): hoy … hoy + 180 días por
 * defecto; si no es flexible, no hay rango. Si el resultado saliera del
 * horizonte (solo pudo pasar por una entrada del usuario), se acota al inicio.
 */
export function rangoFlexible(
  flexible: boolean,
  desde: string | undefined,
  hasta: string | undefined,
  hoy: string,
): { desde: string; hasta: string } | null {
  if (!flexible) return null;
  const d = desde ?? hoy;
  const h = hasta ?? sumarDias(hoy, HORIZONTE_FLEXIBLE_DIAS);
  return { desde: d, hasta: h < d ? d : h };
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
  diasSemana: number[];
  fechaFlexible: boolean;
  fechaDesde: Date | null;
  fechaHasta: Date | null;
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
    diasSemana: normalizarDiasSemana(alerta.diasSemana),
    fechaFlexible: alerta.fechaFlexible,
    fechaDesde: alerta.fechaDesde ? fechaIso(alerta.fechaDesde) : null,
    fechaHasta: alerta.fechaHasta ? fechaIso(alerta.fechaHasta) : null,
    intervaloSondeoMin: alerta.intervaloSondeoMin,
    bono: alerta.bono,
    notas: alerta.notas,
    ultimoSondeoEn: alerta.ultimoSondeoEn?.toISOString() ?? null,
    ultimoEstado: formatearUltimoEstado(alerta.ultimoEstado),
    creadaEn: alerta.creadaEn.toISOString(),
  };
}

@Injectable()
export class AlertasService {
  private readonly logger = new Logger(AlertasService.name);

  constructor(@InjectQueue(COLA_SONDEO) private readonly colaSondeo: Queue) {}

  async listar(usuario: UsuarioRequest): Promise<AlertaResponse[]> {
    const prisma = getPrisma();
    const alertas = await prisma.alerta.findMany({
      where: { usuarioId: usuario.sub },
      orderBy: { creadaEn: 'desc' },
      // Red de seguridad: una alerta lleva su `ultimoEstado` (JSON), así que
      // nunca se cargan todas las del usuario sin techo (medido: ≤ 2 hoy).
      take: 500,
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
    // Sin Redis no hay cola de sondeo: se responde ANTES de crear la alerta para
    // no dejar filas huérfanas que nadie va a mirar (antes se creaba y el error
    // llegaba después).
    if (!process.env.REDIS_URL || !this.colaSondeo) {
      throw new ServiceUnavailableException('Servicio de sondeo no disponible');
    }
    const prisma = getPrisma();
    await asegurarUsuario(prisma, usuario);

    const [origen] = await buscarEstaciones(prisma, datos.origenNombre, 1);
    const [destino] = await buscarEstaciones(prisma, datos.destinoNombre, 1);

    // Trayecto cotidiano o "cualquier fecha": la fecha del formulario se ignora
    // y se ancla a hoy, así ninguna query por fecha (barrido, sondeo) caduca.
    // "Hoy" es el día peninsular (`fechaGtfs`), el mismo reloj que usa el
    // worker para los avisos, no el día UTC.
    const recurrente = datos.fechaFlexible ? false : datos.recurrente;
    const diasSemana = diasSemanaDe({ ...datos, recurrente });
    const rango = rangoFlexible(
      datos.fechaFlexible,
      datos.fechaDesde,
      datos.fechaHasta,
      fechaGtfs(),
    );
    const fechaViaje = recurrente || datos.fechaFlexible ? fechaGtfs() : datos.fechaViaje;

    const alerta = await prisma.alerta.create({
      data: {
        usuarioId: usuario.sub,
        origenNombre: datos.origenNombre,
        destinoNombre: datos.destinoNombre,
        origenEstacionId: origen?.id ?? null,
        destinoEstacionId: destino?.id ?? null,
        fechaViaje: new Date(`${fechaViaje}T00:00:00Z`),
        recurrente,
        // Único formato de días: vacío = todos. `soloLaborables` se espeja
        // (= los días marcados son lun-vie) solo por compatibilidad.
        diasSemana,
        soloLaborables: esSoloLaborables(diasSemana),
        fechaFlexible: datos.fechaFlexible,
        fechaDesde: rango ? new Date(`${rango.desde}T00:00:00Z`) : null,
        fechaHasta: rango ? new Date(`${rango.hasta}T00:00:00Z`) : null,
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
    // Lectura SOLO para fusionar los cambios con lo que ya hay guardado; la
    // escritura de abajo vuelve a filtrar por `usuarioId` y responde 404 si la
    // alerta ha desaparecido en el medio (sin carreras ni P2025).
    const existente = await prisma.alerta.findFirst({ where: { id, usuarioId: usuario.sub } });
    if (!existente) throw new NotFoundException('Alerta no encontrada');

    // Modalidad de fecha tras este parche: "cualquier fecha" ignora `fechaViaje`
    const flexibleFinal = datos.fechaFlexible ?? existente.fechaFlexible;

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
    if (datos.fechaViaje !== undefined && !flexibleFinal) {
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

    const tocaFrecuencia =
      datos.recurrente !== undefined ||
      datos.soloLaborables !== undefined ||
      datos.diasSemana !== undefined ||
      datos.fechaFlexible !== undefined;
    if (tocaFrecuencia) {
      // "Cualquier fecha" y "trayecto cotidiano" son modalidades excluyentes
      const recurrente = flexibleFinal ? false : (datos.recurrente ?? existente.recurrente);
      const diasSemana = diasSemanaDe(
        { recurrente, diasSemana: datos.diasSemana, soloLaborables: datos.soloLaborables },
        existente.diasSemana,
      );
      data.recurrente = recurrente;
      data.diasSemana = diasSemana;
      // Espejo del formato legado: soloLaborables = "los días son lun-vie"
      data.soloLaborables = esSoloLaborables(diasSemana);
      data.fechaFlexible = flexibleFinal;
      if (recurrente || flexibleFinal) {
        // El trayecto cotidiano / el rango flexible se anclan a hoy: la fecha
        // dejó de ser relevante
        data.fechaViaje = new Date(`${fechaGtfs()}T00:00:00Z`);
      }
      // Frecuencia nueva: se re-arman los avisos del día (igual que un cambio de ruta)
      data.recordatorioEnviadoEn = null;
      data.resumenEnviadoEn = null;
      data.recordatorioTrenesEnviados = [];
      cambioRuta = true;
    }

    // Rango del sondeo flexible (hoy … hoy + 180 días por defecto). Solo se
    // persiste si la alerta es flexible; en el resto de modalidades se ignora
    // y se limpia cualquier rango anterior.
    const cambiaRango =
      flexibleFinal &&
      (flexibleFinal !== existente.fechaFlexible ||
        datos.fechaDesde !== undefined ||
        datos.fechaHasta !== undefined);
    if (flexibleFinal && cambiaRango) {
      const rango = rangoFlexible(
        true,
        datos.fechaDesde ?? (existente.fechaDesde ? fechaIso(existente.fechaDesde) : undefined),
        datos.fechaHasta ?? (existente.fechaHasta ? fechaIso(existente.fechaHasta) : undefined),
        fechaGtfs(),
      );
      if (rango) {
        data.fechaDesde = new Date(`${rango.desde}T00:00:00Z`);
        data.fechaHasta = new Date(`${rango.hasta}T00:00:00Z`);
      }
      // Rango nuevo: la rotación de fechas y los avisos empiezan de cero
      data.estadoFlexible = Prisma.JsonNull;
      cambioRuta = true;
    } else if (
      !flexibleFinal &&
      (tocaFrecuencia || existente.fechaFlexible || existente.fechaDesde || existente.fechaHasta)
    ) {
      data.fechaDesde = null;
      data.fechaHasta = null;
      data.estadoFlexible = Prisma.JsonNull;
    }

    if (cambioRuta) {
      data.ultimoEstado = Prisma.JsonNull;
      data.ultimoSondeoEn = null;
      // Cambió el alcance: los servicios ya recordados podrían no aplicar
      data.recordatorioTrenesEnviados = [];
    }

    // `updateMany` con el dueño en el WHERE: si entre la lectura y esta línea
    // otra petición ha borrado la alerta no hay P2025 que explote (count 0 = 404)
    const actualizadas = await prisma.alerta.updateMany({
      where: { id, usuarioId: usuario.sub },
      data: data as never,
    });
    if (actualizadas.count === 0) throw new NotFoundException('Alerta no encontrada');
    const alerta = await prisma.alerta.findUnique({ where: { id } });
    if (!alerta) throw new NotFoundException('Alerta no encontrada');

    if (datos.estado === 'PAUSA' || datos.estado === 'COMPLETADA') {
      await this.quitarSondeo(id);
    } else if (datos.estado === 'ACTIVA' || cambioRuta) {
      await this.encolarSondeo(id);
    }

    return formatearAlerta(alerta);
  }

  async eliminar(usuario: UsuarioRequest, id: string): Promise<void> {
    // Sin lectura previa: el borrado ya lleva al dueño en el WHERE (count 0 = 404)
    const borradas = await getPrisma().alerta.deleteMany({
      where: { id, usuarioId: usuario.sub },
    });
    if (borradas.count === 0) throw new NotFoundException('Alerta no encontrada');
    await this.quitarSondeo(id);
  }

  /**
   * Encola el sondeo con un jobId DETERMINISTA (`sondeo-<id>`): es lo que
   * permite localizar el job con `getJob` para retirarlo, y evita amontonar un
   * job distinto por cada edición (el id ya no lleva `Date.now()`).
   */
  private async encolarSondeo(alertaId: string): Promise<void> {
    const jobId = `sondeo-${alertaId}`;
    if (!process.env.REDIS_URL) {
      // Sin Redis no hay cola: el sweep masivo del worker (cada minuto) se encarga
      this.logger.warn({ alertaId }, 'Sin REDIS_URL: el sondeo no se ha encolado');
      return;
    }
    try {
      // BullMQ IGNORA un `add` cuyo jobId ya existe (aunque esté completado):
      // se retira el previo para que una edición vuelva a disparar el sondeo
      const previo = await this.colaSondeo.getJob(jobId);
      if (previo) await previo.remove().catch(() => undefined);
      await this.colaSondeo.add(
        'sondeo',
        { alertaId },
        {
          jobId,
          removeOnComplete: 100,
          removeOnFail: 500,
          attempts: 3,
          backoff: { type: 'exponential', delay: 5_000 },
        },
      );
    } catch (error) {
      // Redis no disponible: no se tumba la petición, el sweep del worker lo retoma
      this.logger.warn({ alertaId, error: String(error) }, 'No se pudo encolar el sondeo');
    }
  }

  /** Retira el sondeo de una alerta (pausa, completada o borrado) por su id. */
  private async quitarSondeo(alertaId: string): Promise<void> {
    try {
      const job = await this.colaSondeo.getJob(`sondeo-${alertaId}`);
      if (job) await job.remove();
    } catch (error) {
      this.logger.warn(
        { alertaId, error: String(error) },
        'No se pudo retirar el sondeo de la cola',
      );
    }
  }
}
