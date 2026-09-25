import type { Logger } from 'pino';
import { buscarEstaciones, getPrisma } from '@mantirenfe/database';
import { notificar } from './sondeo';

/**
 * Hora actual en el mismo "reloj" en el que se guardan las salidas GTFS
 * (hora peninsular tratada como UTC), para poder comparar con horarioTren.salida.
 */
export function ahoraRelojGtfs(ahora: Date = new Date()): Date {
  const partes = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Madrid',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(ahora); // "2026-09-25 16:53:07"
  return new Date(`${partes.replace(' ', 'T')}Z`);
}

export interface TrenRecordatorio {
  numeroTren: string;
  salida: Date;
}

export interface ElegidoRecordatorio {
  tren: TrenRecordatorio;
  minutosRestantes: number;
}

/**
 * Elige el tren para el recordatorio de salida: la salida más próxima que aún no
 * ha salido, dentro de la ventana de aviso (0 < restantes <= minutosAviso) y de
 * la franja horaria de la alerta (horaDesde/horaHasta, comparadas en HH:MM).
 */
export function elegirTrenRecordatorio(
  trenes: TrenRecordatorio[],
  ahora: Date,
  minutosAviso: number,
  franja: { horaDesde?: string | null; horaHasta?: string | null },
): ElegidoRecordatorio | null {
  const limite = new Date(ahora.getTime() + minutosAviso * 60_000);
  let mejor: ElegidoRecordatorio | null = null;

  for (const tren of trenes) {
    if (tren.salida <= ahora || tren.salida > limite) continue;
    const hora = tren.salida.toISOString().slice(11, 16);
    if (franja.horaDesde && hora < franja.horaDesde) continue;
    if (franja.horaHasta && hora > franja.horaHasta) continue;
    if (!mejor || tren.salida < mejor.tren.salida) {
      mejor = {
        tren,
        minutosRestantes: Math.ceil((tren.salida.getTime() - ahora.getTime()) / 60_000),
      };
    }
  }
  return mejor;
}

function minutosDePreferencias(preferencias: unknown): number {
  let valor: unknown = preferencias;
  if (typeof valor === 'string') {
    try {
      valor = JSON.parse(valor);
    } catch {
      return 50;
    }
  }
  if (valor && typeof valor === 'object') {
    const minutos = (valor as { minutosRecordatorio?: unknown }).minutosRecordatorio;
    if (typeof minutos === 'number' && minutos >= 5 && minutos <= 180) return minutos;
  }
  return 50;
}

/**
 * Envía el recordatorio de salida de las alertas ACTIVAS cuyo viaje es hoy y
 * todavía no se ha avisado. Se ejecuta en cada barrido (1 min); el aviso se
 * marca antes de enviar para no duplicar entre barridos.
 */
export async function procesarRecordatorios(logger: Logger): Promise<number> {
  const prisma = getPrisma();
  const ahora = ahoraRelojGtfs();
  const hoyIso = ahora.toISOString().slice(0, 10);

  const alertas = await prisma.alerta.findMany({
    where: {
      estado: 'ACTIVA',
      fechaViaje: new Date(`${hoyIso}T00:00:00Z`),
      recordatorioEnviadoEn: null,
      NOT: { usuario: { preferencias: { path: ['recordatorioSalida'], equals: false } } },
    },
    include: {
      usuario: {
        select: {
          preferencias: true,
          suscripciones: {
            where: { activa: true },
            select: { endpoint: true, p256dh: true, auth: true },
          },
          tokensMovil: { where: { activa: true }, select: { id: true, token: true } },
        },
      },
    },
    take: 200,
  });

  let enviados = 0;
  for (const alerta of alertas) {
    try {
      const [origen, destino] = await Promise.all([
        buscarEstaciones(prisma, alerta.origenNombre, 5),
        buscarEstaciones(prisma, alerta.destinoNombre, 5),
      ]);
      if (!origen[0] || !destino[0]) continue;

      const horarios = await prisma.horarioTren.findMany({
        where: {
          origenEstacionId: origen[0].id,
          destinoEstacionId: destino[0].id,
          fecha: new Date(`${hoyIso}T00:00:00Z`),
          ...(alerta.numeroTren ? { numeroTren: alerta.numeroTren } : {}),
        },
        orderBy: { salida: 'asc' },
        select: { numeroTren: true, salida: true },
      });
      if (horarios.length === 0) continue;

      const elegido = elegirTrenRecordatorio(
        horarios,
        ahora,
        minutosDePreferencias(alerta.usuario.preferencias),
        { horaDesde: alerta.horaDesde, horaHasta: alerta.horaHasta },
      );
      if (!elegido) continue;

      // Marca primero (condicionada) para que dos barridos simultáneos no dupliquen
      const marcado = await prisma.alerta.updateMany({
        where: { id: alerta.id, recordatorioEnviadoEn: null },
        data: { recordatorioEnviadoEn: new Date() },
      });
      if (marcado.count === 0) continue;

      try {
        await notificar(
          alerta,
          `Tu tren sale en ${elegido.minutosRestantes} min`,
          `${alerta.origenNombre} → ${alerta.destinoNombre}, salida a las ${elegido.tren.salida
            .toISOString()
            .slice(11, 16)} (tren ${elegido.tren.numeroTren})`,
          {
            tipo: 'recordatorio-salida',
            numeroTren: elegido.tren.numeroTren,
            minutos: elegido.minutosRestantes,
          },
          logger,
        );
        enviados += 1;
        logger.info(
          { alertaId: alerta.id, tren: elegido.tren.numeroTren, minutos: elegido.minutosRestantes },
          'Recordatorio de salida enviado',
        );
      } catch (error) {
        // Reintenta en el próximo barrido
        await prisma.alerta.updateMany({
          where: { id: alerta.id },
          data: { recordatorioEnviadoEn: null },
        });
        throw error;
      }
    } catch (error) {
      logger.error({ alertaId: alerta.id, err: error }, 'Fallo enviando recordatorio');
    }
  }
  return enviados;
}
