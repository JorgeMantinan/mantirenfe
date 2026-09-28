import type { Logger } from 'pino';
import { getPrisma } from '@mantirenfe/database';
import { enviarPushMovil } from '../notificaciones/expo-push';
import { enviarPush } from '../notificaciones/web-push';
import { ahoraRelojGtfs } from './reloj';

/** Título del aviso semanal (el cuerpo lleva las métricas). */
export const TITULO_RESUMEN_SEMANAL = 'Tu semana en MantiRenfe';
/** `datos.tipo` del resumen: es también la marca de dedupe (una fila por semana). */
export const TIPO_RESUMEN_SEMANAL = 'resumen-semanal';
/** A dónde lleva el push: no hay alerta concreta detrás del resumen. */
export const URL_RESUMEN_SEMANAL = '/notificaciones';
/** Tope de envíos por semana (el candidato sale de las notificaciones de la semana). */
export const LIMITE_RESUMENES_POR_SEMANA = 500;

export interface RangoSemana {
  /** Lunes 00:00 (reloj peninsular) del lunes anterior */
  inicio: Date;
  /** Lunes 00:00 siguiente: fin exclusivo de la semana resumida */
  fin: Date;
}

/**
 * Semana anterior (lunes a domingo) en el reloj peninsular. Un lunes por la
 * mañana devuelve la semana que acaba de cerrar; cualquier otro día, la última
 * semana completa cerrada. Se calcula sobre el reloj GTFS (peninsular tratada
 * como UTC) para que el corte a medianoche coincida con el usuario, no con UTC.
 */
export function semanaAnterior(ahora: Date = new Date()): RangoSemana {
  const gtfs = ahoraRelojGtfs(ahora);
  const diasDesdeLunes = (gtfs.getUTCDay() + 6) % 7; // 0 = lunes
  const lunesDeEstaSemana = Date.UTC(
    gtfs.getUTCFullYear(),
    gtfs.getUTCMonth(),
    gtfs.getUTCDate() - diasDesdeLunes,
  );
  return {
    inicio: new Date(lunesDeEstaSemana - 7 * 24 * 60 * 60 * 1000),
    fin: new Date(lunesDeEstaSemana),
  };
}

/** Etiqueta del desglose por tipo: [singular, plural]. */
const ETIQUETAS_TIPO: Record<string, [string, string]> = {
  cancelacion: ['cancelación', 'cancelaciones'],
  parada_suprimida: ['parada suprimida', 'paradas suprimidas'],
  incidencia: ['incidencia', 'incidencias'],
  'recordatorio-salida': ['recordatorio de salida', 'recordatorios de salida'],
  'resumen-viaje': ['resumen de viaje', 'resúmenes de viaje'],
  precio: ['aviso de precio', 'avisos de precio'],
};

function leerTexto(datos: unknown, campo: string): string | null {
  if (datos && typeof datos === 'object' && !Array.isArray(datos)) {
    const valor = (datos as Record<string, unknown>)[campo];
    if (typeof valor === 'string') return valor;
  }
  return null;
}

/** Clave de semana del dedupe (YYYY-MM-DD del lunes resumido). */
export function claveSemana(rango: RangoSemana): string {
  return rango.inicio.toISOString().slice(0, 10);
}

export interface NotificacionSemana {
  usuarioId: string;
  creadaEn: Date;
  datos: unknown;
}

export interface MetricasUsuario {
  usuarioId: string;
  /** Notificaciones creadas por el usuario dentro de la semana */
  avisos: number;
  /** Desglose por `datos.tipo` (solo las que lo llevan) */
  porTipo: Record<string, number>;
}

/**
 * Métricas por usuario dentro de la semana: nº de avisos y desglose por
 * `datos.tipo`. Los avisos sin `tipo` (disponibilidad, horario, retraso) cuentan
 * en el total pero no se desglosan, y los propios resúmenes semanales no cuentan
 * para no inflar la semana siguiente.
 */
export function metricasPorUsuario(
  notificaciones: readonly NotificacionSemana[],
  rango: RangoSemana,
): Map<string, MetricasUsuario> {
  const porUsuario = new Map<string, MetricasUsuario>();
  for (const notificacion of notificaciones) {
    if (notificacion.creadaEn < rango.inicio || notificacion.creadaEn >= rango.fin) continue;
    const tipo = leerTexto(notificacion.datos, 'tipo');
    if (tipo === TIPO_RESUMEN_SEMANAL) continue;
    let metrica = porUsuario.get(notificacion.usuarioId);
    if (!metrica) {
      metrica = { usuarioId: notificacion.usuarioId, avisos: 0, porTipo: {} };
      porUsuario.set(notificacion.usuarioId, metrica);
    }
    metrica.avisos += 1;
    if (tipo) metrica.porTipo[tipo] = (metrica.porTipo[tipo] ?? 0) + 1;
  }
  return porUsuario;
}

/**
 * Usuarios a los que ya se les envió el resumen de ESTA semana: se detecta por
 * la propia `Notificacion` con `datos.tipo = 'resumen-semanal'` y
 * `datos.semana` igual al lunes resumido (sin columna nueva en el esquema).
 * Se pasa la semana y no la fecha de envío para que una re-ejecución del job
 * (el mismo lunes o días después) no duplique el aviso.
 */
export function usuariosYaResumidos(
  notificaciones: readonly NotificacionSemana[],
  rango: RangoSemana,
): Set<string> {
  const clave = claveSemana(rango);
  const resumidos = new Set<string>();
  for (const notificacion of notificaciones) {
    if (leerTexto(notificacion.datos, 'tipo') !== TIPO_RESUMEN_SEMANAL) continue;
    if (leerTexto(notificacion.datos, 'semana') !== clave) continue;
    resumidos.add(notificacion.usuarioId);
  }
  return resumidos;
}

/** "2 cancelaciones, 1 incidencia" (vacío si no hay tipos con etiqueta). */
export function desglosePorTipo(porTipo: Record<string, number>): string {
  const partes: string[] = [];
  for (const [tipo, etiquetas] of Object.entries(ETIQUETAS_TIPO)) {
    const total = porTipo[tipo];
    if (!total) continue;
    partes.push(`${total} ${total === 1 ? etiquetas[0] : etiquetas[1]}`);
  }
  return partes.join(', ');
}

/**
 * Cuerpo del aviso: "3 avisos de 2 alertas activas (2 cancelaciones, 1
 * incidencia)". Sin alertas activas se omite el segundo trozo para no leer
 * "3 avisos de 0 alertas activas"; los tipos sin etiqueta conocida no se
 * desglosan (mejor un mensaje predecible que texto suelto de `datos.tipo`).
 */
export function cuerpoResumenSemanal(metrica: MetricasUsuario, alertasActivas: number): string {
  const avisos = `${metrica.avisos} ${metrica.avisos === 1 ? 'aviso' : 'avisos'}`;
  const base =
    alertasActivas > 0
      ? `${avisos} de ${alertasActivas} ${
          alertasActivas === 1 ? 'alerta activa' : 'alertas activas'
        }`
      : `${avisos} esta semana`;
  const desglose = desglosePorTipo(metrica.porTipo);
  return desglose ? `${base} (${desglose})` : base;
}

/**
 * Preferencia `notificacionesPush` (por defecto activa). Es el mismo criterio
 * que `pushHabilitado` de sondeo.ts, duplicado aquí a propósito: este fichero no
 * debe tocar sondeo.ts (otra tarea lo está cambiando) y el resumen no comparte
 * más lógica con el envío por alerta que el par web-push/expo-push.
 */
export function pushHabilitado(preferencias: unknown): boolean {
  let valor: unknown = preferencias;
  if (typeof valor === 'string') {
    try {
      valor = JSON.parse(valor);
    } catch {
      return true;
    }
  }
  if (valor && typeof valor === 'object') {
    return (valor as { notificacionesPush?: boolean }).notificacionesPush !== false;
  }
  return true;
}

export interface UsuarioPush {
  id: string;
  preferencias: unknown;
  suscripciones: Array<{ endpoint: string; p256dh: string; auth: string }>;
  tokensMovil: Array<{ id: string; token: string }>;
}

/**
 * Push genérico a un usuario (sin alerta detrás): guarda la `Notificacion` y
 * manda web-push + expo-push si la preferencia lo permite. Es la contraparte de
 * `notificar` de sondeo.ts para avisos que no pertenecen a una alerta.
 */
export async function notificarUsuario(
  usuario: UsuarioPush,
  titulo: string,
  cuerpo: string,
  datos: Record<string, unknown>,
  logger: Logger,
): Promise<void> {
  const url = typeof datos.url === 'string' ? datos.url : URL_RESUMEN_SEMANAL;
  const tag =
    typeof datos.tag === 'string' ? datos.tag : (leerTexto(datos, 'tipo') ?? 'mantirenfe');
  const prisma = getPrisma();
  await prisma.notificacion.create({
    data: {
      usuarioId: usuario.id,
      titulo,
      cuerpo,
      datos: { ...datos, url },
    },
  });

  if (pushHabilitado(usuario.preferencias)) {
    const payload = { title: titulo, body: cuerpo, url, tag };
    await enviarPush(usuario.suscripciones, payload, logger);
    await enviarPushMovil(usuario.tokensMovil, payload, logger);
  }
}

/**
 * Resumen semanal por push (lunes por la mañana).
 *
 * A quién: usuarios con al menos una `Notificacion` creada en la semana anterior
 * (lun-dom, reloj peninsular). Es el criterio más sensato y el más barato: es
 * una sola consulta, identifica a quien de verdad recibió avisos (los que no
 * recibieron ninguno recibirían un "0 avisos" sin interés) e incluye tanto a
 * quien tenía alertas activas como a las recurrentes y a las completadas en la
 * semana. Alternativas descartadas: "alertas ACTIVA o completada esta semana"
 * obliga a deducir el estado pasado de `fechaViaje`/`ultimoSondeoEn` (frágil) y
 * avisaría también a quien no recibió nada.
 *
 * Métricas: nº de avisos de la semana (conteo de `Notificacion` por usuario),
 * desglose por `datos.tipo` y nº de alertas ACTIVAS actuales del usuario (una
 * sola `groupBy`). No se cruza con `ImpuntualidadTren`: haría un join por ruta,
 * fecha y trip por usuario por un dato que la propia web ya muestra; métricas
 * simples y fiables > complejas.
 *
 * Dedupe: la propia `Notificacion` del resumen (`datos.tipo = 'resumen-semanal'`
 * + `datos.semana` = lunes resumido); si ya existe, no se vuelve a enviar.
 *
 * Preferencia: solo push. Se respeta `notificacionesPush` del usuario (por
 * defecto activa); `resumenViaje` NO, porque es la del día del viaje. Quien la
 * tiene en false no recibe nada (ni siquiera la fila en el centro de avisos).
 */
export async function enviarResumenSemanal(
  logger: Logger,
  ahora: Date = new Date(),
): Promise<number> {
  const rango = semanaAnterior(ahora);
  const clave = claveSemana(rango);
  const prisma = getPrisma();

  // Una sola consulta desde el lunes resumido: cubre la semana (métricas) y el
  // lunes en curso (donde se guarda la marca de dedupe)
  const notificaciones = await prisma.notificacion.findMany({
    where: { creadaEn: { gte: rango.inicio } },
    select: { usuarioId: true, creadaEn: true, datos: true },
  });

  const metricas = metricasPorUsuario(notificaciones, rango);
  const yaResumidos = usuariosYaResumidos(notificaciones, rango);
  const candidatos = [...metricas.values()].filter((m) => !yaResumidos.has(m.usuarioId));
  if (candidatos.length === 0) return 0;

  const activas = await prisma.alerta.groupBy({
    by: ['usuarioId'],
    where: { estado: 'ACTIVA' },
    _count: { _all: true },
  });
  const activasPorUsuario = new Map(activas.map((a) => [a.usuarioId, a._count._all]));

  const usuarios = await prisma.usuario.findMany({
    where: { id: { in: candidatos.map((c) => c.usuarioId) } },
    select: {
      id: true,
      preferencias: true,
      suscripciones: {
        where: { activa: true },
        select: { endpoint: true, p256dh: true, auth: true },
      },
      tokensMovil: { where: { activa: true }, select: { id: true, token: true } },
    },
  });
  const porId = new Map(usuarios.map((u) => [u.id, u]));

  let enviados = 0;
  for (const metrica of candidatos.slice(0, LIMITE_RESUMENES_POR_SEMANA)) {
    const usuario = porId.get(metrica.usuarioId);
    if (!usuario) continue;
    if (!pushHabilitado(usuario.preferencias)) continue;
    const alertasActivas = activasPorUsuario.get(metrica.usuarioId) ?? 0;
    try {
      await notificarUsuario(
        usuario,
        TITULO_RESUMEN_SEMANAL,
        cuerpoResumenSemanal(metrica, alertasActivas),
        {
          tipo: TIPO_RESUMEN_SEMANAL,
          semana: clave,
          avisos: metrica.avisos,
          alertasActivas,
          porTipo: metrica.porTipo,
          url: URL_RESUMEN_SEMANAL,
          tag: `resumen-semanal-${clave}`,
        },
        logger,
      );
      enviados += 1;
    } catch (error) {
      // Sin fila no hay marca: la próxima re-ejecución del job lo reintenta
      logger.warn({ usuarioId: metrica.usuarioId, err: error }, 'Resumen semanal no enviado');
    }
  }

  if (candidatos.length > LIMITE_RESUMENES_POR_SEMANA) {
    logger.warn(
      { candidatos: candidatos.length, limite: LIMITE_RESUMENES_POR_SEMANA },
      'Resumen semanal: se alcanzó el límite de envíos',
    );
  }
  if (enviados > 0) {
    logger.info({ semana: clave, enviados }, 'Resúmenes semanales enviados');
  }
  return enviados;
}
