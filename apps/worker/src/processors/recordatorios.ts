import type { Logger } from 'pino';
import { buscarEstaciones, getPrisma } from '@mantirenfe/database';
import { crearFuenteDatos } from '../fuentes';
import { preferenciaBooleana } from '../notificaciones/preferencias';
import { ahoraRelojGtfs, esDiaAplicable } from './reloj';
import { notificar } from './sondeo';

export { ahoraRelojGtfs, esDiaAplicable, esLaborable, hoyGtfs } from './reloj';
// Re-exportado para no romper a nadie que lo importara de aquí
export { preferenciaBooleana };

export interface TrenRecordatorio {
  numeroTren: string;
  salida: Date;
}

export interface ElegidoRecordatorio {
  tren: TrenRecordatorio;
  minutosRestantes: number;
}

/**
 * Elige los trenes para el recordatorio de salida: TODAS las salidas que aún no
 * han salido y están dentro de la ventana de aviso (0 < restantes <= minutosAviso)
 * y de la franja horaria de la alerta, ordenadas por salida. Así cada tren del
 * día recibe su recordatorio cuando le toca (no solo el más próximo).
 */
export function elegirTrenesRecordatorio(
  trenes: TrenRecordatorio[],
  ahora: Date,
  minutosAviso: number,
  franja: { horaDesde?: string | null; horaHasta?: string | null },
): ElegidoRecordatorio[] {
  const limite = new Date(ahora.getTime() + minutosAviso * 60_000);
  const elegidos: ElegidoRecordatorio[] = [];

  for (const tren of trenes) {
    if (tren.salida <= ahora || tren.salida > limite) continue;
    const hora = tren.salida.toISOString().slice(11, 16);
    if (franja.horaDesde && hora < franja.horaDesde) continue;
    if (franja.horaHasta && hora > franja.horaHasta) continue;
    elegidos.push({
      tren,
      minutosRestantes: Math.ceil((tren.salida.getTime() - ahora.getTime()) / 60_000),
    });
  }
  return elegidos.sort((a, b) => a.tren.salida.getTime() - b.tren.salida.getTime());
}

/** Clave única de un servicio para no repetir su recordatorio (numeroTren-HH:MM) */
export function claveServicioRecordatorio(tren: TrenRecordatorio): string {
  return `${tren.numeroTren}-${tren.salida.toISOString().slice(11, 16)}`;
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

/** Primera salida de hoy todavía futura y dentro de la franja de la alerta. */
export function elegirSalidaDelDia(
  trenes: HorarioBd[],
  ahora: Date,
  franja: { horaDesde?: string | null; horaHasta?: string | null },
): HorarioBd | null {
  for (const tren of trenes) {
    if (tren.salida <= ahora) continue;
    const hora = tren.salida.toISOString().slice(11, 16);
    if (franja.horaDesde && hora < franja.horaDesde) continue;
    if (franja.horaHasta && hora > franja.horaHasta) continue;
    return tren;
  }
  return null;
}

interface HorarioBd {
  numeroTren: string;
  salida: Date;
}

/**
 * Resumen del día del viaje: "hoy viajas X→Y a las HH:MM". Se envía una sola
 * vez, a partir de la hora configurada (RESUMEN_HORA, 07:30 por defecto).
 */
export async function procesarResumenes(logger: Logger): Promise<number> {
  const ahora = ahoraRelojGtfs();
  const hoyIso = ahora.toISOString().slice(0, 10);
  const horaAhora = ahora.toISOString().slice(11, 16);
  const horaConfigurada = process.env.RESUMEN_HORA ?? '07:30';
  if (horaAhora < horaConfigurada) return 0;

  const prisma = getPrisma();
  // El filtro de preferencias se hace en memoria: el path-filter de Prisma
  // excluye silenciosamente las filas cuyas preferencias son el string "{}"
  // (el default del esquema) en vez de un objeto JSON.
  const alertas = await prisma.alerta.findMany({
    where: {
      estado: 'ACTIVA',
      // El trayecto cotidiano no caduca: se resumen cada día aunque su fechaViaje sea antigua.
      // Las de fecha flexible no tienen un día concreto: no resumen "hoy".
      fechaFlexible: false,
      OR: [{ fechaViaje: new Date(`${hoyIso}T00:00:00Z`) }, { recurrente: true }],
      resumenEnviadoEn: null,
      recordatorioEnviadoEn: null, // si ya queda poco para salir, manda el recordatorio
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
    // Orden fijo: con `take` sin orden el lote de 200 salía arbitrario y una
    // alerta podía quedarse siempre fuera
    orderBy: [{ id: 'asc' }],
    take: 200,
  });
  const pendientes = alertas.filter(
    (a) =>
      esDiaAplicable(a, ahora) && preferenciaBooleana(a.usuario.preferencias, 'resumenViaje', true),
  );

  let enviados = 0;
  for (const alerta of pendientes) {
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
          // Solo lo que aún no ha salido: lo demás `elegirSalidaDelDia` lo descarta igual
          salida: { gt: ahora },
          ...(alerta.numeroTren ? { numeroTren: alerta.numeroTren } : {}),
        },
        orderBy: { salida: 'asc' },
        select: { numeroTren: true, salida: true },
      });
      const salida = elegirSalidaDelDia(horarios, ahora, {
        horaDesde: alerta.horaDesde,
        horaHasta: alerta.horaHasta,
      });
      if (!salida) continue;

      const marcado = await prisma.alerta.updateMany({
        where: { id: alerta.id, resumenEnviadoEn: null },
        data: { resumenEnviadoEn: new Date() },
      });
      if (marcado.count === 0) continue;

      // Retraso en vivo si GTFS-RT contesta (si no, el resumen sale sin él)
      let retrasoTexto = '';
      try {
        const fuente = crearFuenteDatos('RETRASO');
        const estado = await fuente.getDisponibilidad({
          origenNombre: alerta.origenNombre,
          destinoNombre: alerta.destinoNombre,
          fecha: hoyIso,
          numeroTren: salida.numeroTren,
        });
        const retraso = estado.trenes.find((t) => t.numeroTren === salida.numeroTren)?.retrasoSeg;
        if (retraso != null && retraso >= 60) {
          retrasoTexto = ` · retraso +${Math.round(retraso / 60)} min`;
        } else if (retraso === 0) {
          retrasoTexto = ' · a tiempo';
        }
      } catch {
        // sin retraso el resumen sigue siendo útil
      }

      try {
        await notificar(
          alerta,
          'Tu viaje de hoy',
          `${alerta.origenNombre} → ${alerta.destinoNombre}: sale a las ${salida.salida
            .toISOString()
            .slice(11, 16)} (tren ${salida.numeroTren})${retrasoTexto}`,
          {
            tipo: 'resumen-viaje',
            numeroTren: salida.numeroTren,
            salida: salida.salida.toISOString(),
          },
          logger,
        );
        enviados += 1;
        logger.info({ alertaId: alerta.id, tren: salida.numeroTren }, 'Resumen del viaje enviado');
      } catch (error) {
        await prisma.alerta.updateMany({
          where: { id: alerta.id },
          data: { resumenEnviadoEn: null },
        });
        throw error;
      }
    } catch (error) {
      logger.error({ alertaId: alerta.id, err: error }, 'Fallo enviando el resumen del viaje');
    }
  }
  return enviados;
}

/**
 * Envía el recordatorio de salida de las alertas ACTIVAS cuyo viaje es hoy y
 * todavía no se ha avisado. Se ejecuta en cada barrido (1 min); los servicios
 * ya avisados se guardan con UN único updateMany al final de cada alerta y lo
 * que falle se queda fuera del set para reintentarse en el siguiente barrido.
 */
export async function procesarRecordatorios(logger: Logger): Promise<number> {
  const prisma = getPrisma();
  const ahora = ahoraRelojGtfs();
  const hoyIso = ahora.toISOString().slice(0, 10);

  const alertas = await prisma.alerta.findMany({
    where: {
      estado: 'ACTIVA',
      // El trayecto cotidiano no caduca: se recuerda cada día aunque su fechaViaje sea antigua.
      // Las de fecha flexible no tienen un día concreto: no mandan recordatorio de salida.
      fechaFlexible: false,
      OR: [{ fechaViaje: new Date(`${hoyIso}T00:00:00Z`) }, { recurrente: true }],
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
    // Orden fijo: con `take` sin orden el lote de 200 salía arbitrario y una
    // alerta podía quedarse siempre fuera
    orderBy: [{ id: 'asc' }],
    take: 200,
  });
  // Preferencias en memoria (el path-filter de SQL excluye el default "{}")
  const pendientes = alertas.filter(
    (a) =>
      esDiaAplicable(a, ahora) &&
      preferenciaBooleana(a.usuario.preferencias, 'recordatorioSalida', true),
  );

  let enviados = 0;
  for (const alerta of pendientes) {
    try {
      const [origen, destino] = await Promise.all([
        buscarEstaciones(prisma, alerta.origenNombre, 5),
        buscarEstaciones(prisma, alerta.destinoNombre, 5),
      ]);
      if (!origen[0] || !destino[0]) continue;

      const ventanaMin = minutosDePreferencias(alerta.usuario.preferencias);
      const horarios = await prisma.horarioTren.findMany({
        where: {
          origenEstacionId: origen[0].id,
          destinoEstacionId: destino[0].id,
          fecha: new Date(`${hoyIso}T00:00:00Z`),
          // La ventana de aviso se filtra en SQL: sin ella el lote traía todos
          // los trenes del día para descartarlos después en memoria
          salida: { gt: ahora, lte: new Date(ahora.getTime() + ventanaMin * 60_000) },
          ...(alerta.numeroTren ? { numeroTren: alerta.numeroTren } : {}),
        },
        orderBy: { salida: 'asc' },
        select: { numeroTren: true, salida: true },
      });
      if (horarios.length === 0) continue;

      const candidatos = elegirTrenesRecordatorio(horarios, ahora, ventanaMin, {
        horaDesde: alerta.horaDesde,
        horaHasta: alerta.horaHasta,
      }).filter(
        (c) => !alerta.recordatorioTrenesEnviados.includes(claveServicioRecordatorio(c.tren)),
      );

      // Copia local: el set es idempotente (el barrido es secuencial, sin carreras)
      let serviciosRecordados = [...alerta.recordatorioTrenesEnviados];

      for (const candidato of candidatos) {
        const clave = claveServicioRecordatorio(candidato.tren);
        if (serviciosRecordados.includes(clave)) continue;
        serviciosRecordados = [...serviciosRecordados, clave];
        try {
          await notificar(
            alerta,
            `Tu tren sale en ${candidato.minutosRestantes} min`,
            `${alerta.origenNombre} → ${alerta.destinoNombre}, salida a las ${candidato.tren.salida
              .toISOString()
              .slice(11, 16)} (tren ${candidato.tren.numeroTren})`,
            {
              tipo: 'recordatorio-salida',
              numeroTren: candidato.tren.numeroTren,
              minutos: candidato.minutosRestantes,
            },
            logger,
          );
          enviados += 1;
          logger.info(
            {
              alertaId: alerta.id,
              tren: candidato.tren.numeroTren,
              minutos: candidato.minutosRestantes,
            },
            'Recordatorio de salida enviado',
          );
        } catch (error) {
          // No se marca: el próximo barrido vuelve a intentarlo
          serviciosRecordados = serviciosRecordados.filter((c) => c !== clave);
          logger.error(
            { alertaId: alerta.id, tren: candidato.tren.numeroTren, err: error },
            'Fallo enviando recordatorio',
          );
        }
      }

      // Un único updateMany por alerta (en vez de uno por tren) con el set
      // completo y la marca de "ya se avisó hoy"
      if (serviciosRecordados.length !== alerta.recordatorioTrenesEnviados.length) {
        await prisma.alerta.updateMany({
          where: { id: alerta.id },
          data: {
            recordatorioTrenesEnviados: { set: serviciosRecordados },
            recordatorioEnviadoEn: new Date(),
          },
        });
      }
    } catch (error) {
      logger.error({ alertaId: alerta.id, err: error }, 'Fallo enviando recordatorio');
    }
  }
  return enviados;
}
