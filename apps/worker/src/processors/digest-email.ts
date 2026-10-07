import type { Logger } from 'pino';
import { getPrisma } from '@mantirenfe/database';
import { horaGtfs, horaComoTexto, type EstadoSerializado } from '@mantirenfe/shared-types';
import { enviarEmail } from '../notificaciones/email';
import { preferenciaBooleana } from '../notificaciones/preferencias';
import { leerTexto } from '../notificaciones/util';
import { ahoraRelojGtfs, esDiaAplicable } from './reloj';

/** `datos.tipo` de la marca de dedupe: una fila de `Notificacion` por usuario y día. */
export const TIPO_DIGEST_EMAIL = 'digest-email';
/** Máximo de líneas de salida en el cuerpo (y en el recuento del asunto). */
export const MAXIMO_SALIDAS_DIGEST = 10;
/** Máximo de alertas sin estado que se detallan con su línea de "sondeando...". */
export const MAXIMO_SONDEANDO_DIGEST = 10;
/** Solo se miran marcas de dedupe de las últimas 24 h (consulta acotada). */
const VENTANA_DEDUPE_MS = 24 * 60 * 60 * 1000;
/** Tope de alertas leídas por ejecución (una fila por alerta, no por usuario). */
const LIMITE_ALERTAS_DIGEST = 1000;

/** Una alerta con lo necesario para redactar su trozo del digest. */
export interface AlertaDigest {
  id: string;
  origenNombre: string;
  destinoNombre: string;
  recurrente: boolean;
  /** Días aplicables (0 = domingo … 6 = sábado); vacío = todos los días. */
  diasSemana: number[];
  /** LEGACY: lo sigue leyendo `esDiaAplicable` en filas anteriores a `diasSemana`. */
  soloLaborables: boolean;
  horaDesde: string | null;
  horaHasta: string | null;
  ultimoEstado: unknown;
}

export interface DigestDiario {
  cuerpo: string;
  /** Nº de líneas de salida incluidas (0 si el día no tiene datos de trenes) */
  salidas: number;
}

/** Encabezado del cuerpo: "lunes 28 de septiembre" en el reloj peninsular. */
export function fechaDigest(ahora: Date): string {
  return new Intl.DateTimeFormat('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'Europe/Madrid',
  })
    .format(ahora)
    .replace(', ', ' '); // es-ES escribe "lunes, 28 de septiembre"
}

/** Salida en su franja horaria (HH:MM peninsular comparado como texto). */
function enFranja(salida: string, horaDesde: string | null, horaHasta: string | null): boolean {
  const hora = horaGtfs(salida);
  if (horaDesde && hora < horaDesde) return false;
  if (horaHasta && hora > horaHasta) return false;
  return true;
}

/**
 * Estado de una salida en el digest: cancelado manda; si hay plazas se cita el
 * precio más barato; sin disponibilidad confirmada se lee como "sin datos"
 * (las fuentes no distinguen entre completo y sin tarifa). El precio se queda
 * con espacio normal (no el no-break de Intl) para que el texto plano del
 * email sea predecible en cualquier ICU.
 */
export function textoSalidaDigest(tren: EstadoSerializado): string {
  if (tren.cancelado) return '⚠ Cancelado';
  if (tren.disponible) {
    if (typeof tren.precioMin !== 'number') return 'Hay plazas';
    const precio = tren.precioMin
      .toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })
      .replace(/[\u00A0\u202F]/g, ' ');
    return `Hay plazas desde ${precio}`;
  }
  return 'Sin datos de plazas aún';
}

/** "· 07:35 A Coruña → Madrid (tren 04314) — Hay plazas desde 32,50 €". */
export function lineaSalidaDigest(alerta: AlertaDigest, tren: EstadoSerializado): string {
  const numero = (tren.numeroTren ?? '').trim();
  const trenTexto = numero ? ` (tren ${numero})` : '';
  return `· ${horaGtfs(tren.salida)} ${alerta.origenNombre} → ${alerta.destinoNombre}${trenTexto} — ${textoSalidaDigest(tren)}`;
}

/** Asunto del email: nº de salidas incluidas en el cuerpo. */
export function asuntoDigest(salidas: number): string {
  if (salidas === 0) return 'MantiRenfe · Tu día de viaje — sin salidas hoy';
  return `MantiRenfe · Tu día de viaje — ${salidas} ${salidas === 1 ? 'salida' : 'salidas'} hoy`;
}

/**
 * Cuerpo de texto plano del digest de un usuario.
 *
 * - Una línea por salida de `ultimoEstado` (todas las alertas juntas), ordenada
 *   por hora y con un tope de 10; la franja `horaDesde`/`horaHasta` de cada
 *   alerta se aplica antes de contar.
 * - Una alerta sin `ultimoEstado` todavía no tiene trenes que mostrar: línea de
 *   "sondeando..." con su trayecto.
 * - Una alerta con estado pero sin ninguna salida en su franja entra en el
 *   remate "Sin salidas hoy: N alertas en pausa de datos...".
 * - `null` si no hay ninguna alerta: entonces no se envía nada.
 */
export function construirDigest(
  alertas: readonly AlertaDigest[],
  ahora: Date,
): DigestDiario | null {
  if (alertas.length === 0) return null;

  const salidas: Array<{ hora: string; texto: string }> = [];
  const sondeando: string[] = [];
  let enPausa = 0;

  for (const alerta of alertas) {
    const estado = Array.isArray(alerta.ultimoEstado)
      ? (alerta.ultimoEstado as EstadoSerializado[])
      : null;
    if (!estado) {
      if (sondeando.length < MAXIMO_SONDEANDO_DIGEST) {
        sondeando.push(`· ${alerta.origenNombre} → ${alerta.destinoNombre} — sondeando...`);
      }
      continue;
    }
    const delDia = estado.filter((t) => enFranja(t.salida, alerta.horaDesde, alerta.horaHasta));
    if (delDia.length === 0) {
      enPausa += 1;
      continue;
    }
    for (const tren of delDia) {
      salidas.push({ hora: horaGtfs(tren.salida), texto: lineaSalidaDigest(alerta, tren) });
    }
  }

  salidas.sort((a, b) => a.hora.localeCompare(b.hora));
  const lineas = salidas.slice(0, MAXIMO_SALIDAS_DIGEST).map((s) => s.texto);
  lineas.push(...sondeando);
  if (enPausa > 0) {
    lineas.push(
      `Sin salidas hoy: ${enPausa} ${enPausa === 1 ? 'alerta' : 'alertas'} en pausa de datos...`,
    );
  }

  return {
    cuerpo: [`Tu día de viaje — ${fechaDigest(ahora)}`, ...lineas].join('\n'),
    salidas: Math.min(salidas.length, MAXIMO_SALIDAS_DIGEST),
  };
}

/**
 * Digest diario de salidas por email (una vez por mañana peninsular).
 *
 * A quién: usuarios con `notificacionesEmail` activa (por defecto false, es la
 * preferencia de este canal y es independiente del push) y al menos una alerta
 * ACTIVA aplicable HOY: recurrente que pasa `esDiaAplicable` (los días que
 * marque `diasSemana`) o con `fechaViaje` = hoy. Sin preferencia no se consulta
 * ni se envía nada en nombre de ese usuario.
 *
 * Qué: un único email por usuario con las salidas del día de sus alertas
 * (líneas de `ultimoEstado`, franja horaria respetada, máximo 10). Si no hay
 * ninguna alerta aplicable no se envía; si las hay pero ninguna salida, el
 * cuerpo avisa de las alertas sin datos.
 *
 * Dedupe sin tocar el esquema: la propia `Notificacion` creada al enviar, con
 * `datos.tipo = 'digest-email'` y `datos.dia` = hoy (YYYY-MM-DD peninsular),
 * consultada en la ventana de 24 h. Una re-ejecución del job (o un rebote del
 * repeat) no vuelve a mandar el mismo día.
 *
 * Email: `enviarEmail` (SMTP_HOST/SMTP_PASS); sin esas variables se omite con
 * un debug y no rompe la ejecución.
 */
export async function enviarDigestDiario(
  logger: Logger,
  ahora: Date = new Date(),
): Promise<number> {
  const ahoraGtfs = ahoraRelojGtfs(ahora);
  const hoyIso = ahoraGtfs.toISOString().slice(0, 10);
  const prisma = getPrisma();

  const alertas = await prisma.alerta.findMany({
    where: {
      estado: 'ACTIVA',
      // El trayecto recurrente no caduca; el puntual solo cuenta si viaja hoy.
      // Las de fecha flexible no tienen "hoy" propio: se quedan fuera del digest.
      fechaFlexible: false,
      OR: [{ fechaViaje: new Date(`${hoyIso}T00:00:00Z`) }, { recurrente: true }],
    },
    select: {
      id: true,
      usuarioId: true,
      origenNombre: true,
      destinoNombre: true,
      recurrente: true,
      diasSemana: true,
      soloLaborables: true,
      horaDesde: true,
      horaHasta: true,
      ultimoEstado: true,
      usuario: { select: { email: true, preferencias: true } },
    },
    take: LIMITE_ALERTAS_DIGEST,
  });

  // Preferencias y día aplicable en memoria: el path-filter de Prisma excluye
  // silenciosamente las filas cuyas preferencias son el string "{}" (el default
  // del esquema), que es justo el caso de "no ha activado notificacionesEmail".
  const candidatos = new Map<string, { email: string | null; alertas: AlertaDigest[] }>();
  for (const alerta of alertas) {
    if (!preferenciaBooleana(alerta.usuario.preferencias, 'notificacionesEmail', false)) continue;
    if (!esDiaAplicable(alerta, ahoraGtfs)) continue;
    let grupo = candidatos.get(alerta.usuarioId);
    if (!grupo) {
      grupo = { email: alerta.usuario.email, alertas: [] };
      candidatos.set(alerta.usuarioId, grupo);
    }
    // `horaDesde`/`horaHasta` son columnas @db.Time (Date en JS al salir de
    // Prisma) y el digest compara texto HH:MM: se normaliza justo aquí, en el
    // borde de la BD.
    grupo.alertas.push({
      id: alerta.id,
      origenNombre: alerta.origenNombre,
      destinoNombre: alerta.destinoNombre,
      recurrente: alerta.recurrente,
      diasSemana: alerta.diasSemana,
      soloLaborables: alerta.soloLaborables,
      horaDesde: horaComoTexto(alerta.horaDesde),
      horaHasta: horaComoTexto(alerta.horaHasta),
      ultimoEstado: alerta.ultimoEstado,
    });
  }
  if (candidatos.size === 0) return 0;

  const desde = new Date(ahora.getTime() - VENTANA_DEDUPE_MS);
  const marcas = await prisma.notificacion.findMany({
    where: { creadaEn: { gte: desde } },
    select: { usuarioId: true, datos: true },
  });
  const yaEnviados = new Set<string>();
  for (const marca of marcas) {
    if (leerTexto(marca.datos, 'tipo') !== TIPO_DIGEST_EMAIL) continue;
    if (leerTexto(marca.datos, 'dia') !== hoyIso) continue;
    yaEnviados.add(marca.usuarioId);
  }

  let enviados = 0;
  for (const [usuarioId, grupo] of candidatos) {
    if (yaEnviados.has(usuarioId)) continue;
    if (!grupo.email) continue;
    const digest = construirDigest(grupo.alertas, ahora);
    if (!digest) continue;
    const asunto = asuntoDigest(digest.salidas);
    try {
      await enviarEmail(grupo.email, asunto, digest.cuerpo, logger);
      // La marca se crea al enviar: deja constancia en el centro de avisos y es
      // la que evita el reenvío; si falla, la re-ejecución del job reintenta
      await prisma.notificacion.create({
        data: {
          usuarioId,
          titulo: asunto,
          cuerpo: digest.cuerpo,
          datos: {
            tipo: TIPO_DIGEST_EMAIL,
            dia: hoyIso,
            salidas: digest.salidas,
            alertas: grupo.alertas.length,
            url: '/notificaciones',
            tag: `digest-email-${hoyIso}`,
          },
        },
      });
      enviados += 1;
    } catch (error) {
      logger.warn({ usuarioId, err: error }, 'Digest diario no enviado');
    }
  }

  if (enviados > 0) {
    logger.info({ dia: hoyIso, enviados }, 'Digests diarios enviados');
  }
  return enviados;
}
