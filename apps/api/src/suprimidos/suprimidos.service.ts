import { BadRequestException, Injectable } from '@nestjs/common';
import { buscarEstaciones, getPrisma } from '@mantirenfe/database';
import { fechaGtfs, type SuprimidoResponse } from '@mantirenfe/shared-types';
import { enriquecerSuprimidos, type ParadaExtremo } from './enriquecer';

const RE_FECHA = /^\d{4}-\d{2}-\d{2}$/;

@Injectable()
export class SuprimidosService {
  /**
   * Trenes suprimidos registrados para `fecha` (por defecto, el día peninsular
   * actual), opcionalmente reducidos a los que pasan por `estacion`.
   *
   * El filtro por estación se resuelve con `buscarEstaciones` (top 1) y después
   * se cruzan las paradas SOLO con los tripIds cancelados de ese día: sobre la
   * estación más transitada (Madrid-Atocha Cercanías, 29.721 paradas) esa
   * variante devuelve 8 filas en ~47 ms, mientras que pedir todas las paradas de
   * la estación y cruzarlas en memoria son ~83 ms y 29.721 filas de ida.
   * En cualquier caso el viaje de ida es el mismo número de queries (2-3).
   */
  async listado(fecha?: string, estacion?: string): Promise<SuprimidoResponse[]> {
    const fechaConsulta = fecha?.trim() || fechaGtfs();
    if (!RE_FECHA.test(fechaConsulta)) {
      throw new BadRequestException('Fecha inválida (formato YYYY-MM-DD)');
    }

    const prisma = getPrisma();
    const dia = new Date(`${fechaConsulta}T00:00:00Z`);
    const cancelaciones = await prisma.cancelacion.findMany({
      where: { fecha: dia },
      select: { tripId: true, numeroTren: true, fecha: true },
    });
    if (cancelaciones.length === 0) return [];

    let delDia = cancelaciones;
    const consulta = estacion?.trim();
    if (consulta) {
      const [mejor] = await buscarEstaciones(prisma, consulta, 1);
      if (!mejor) return [];

      const paradas = await prisma.paradaHorario.findMany({
        where: { estacionId: mejor.id, tripId: { in: cancelaciones.map((c) => c.tripId) } },
        select: { tripId: true },
      });
      const quePasan = new Set(paradas.map((p) => p.tripId));
      delDia = cancelaciones.filter((c) => quePasan.has(c.tripId));
      if (delDia.length === 0) return [];
    }

    const tripIds = delDia.map((c) => c.tripId);
    const horarios = await prisma.horarioTren.findMany({
      where: { fecha: dia, tripId: { in: tripIds } },
      select: {
        tripId: true,
        numeroTren: true,
        salida: true,
        llegada: true,
        origen: { select: { nombre: true } },
        destino: { select: { nombre: true } },
      },
    });

    // Sin fila de horario (dato aún no sincronizado o viaje fuera de la ventana)
    // se recurre a ParadaHorario para poder enseñar al menos extremos y horas.
    const conHorario = new Set(
      horarios.map((h) => h.tripId).filter((t): t is string => Boolean(t)),
    );
    const sinHorario = tripIds.filter((t) => !conHorario.has(t));
    let extremos: ParadaExtremo[] = [];
    if (sinHorario.length > 0) {
      extremos = await prisma.paradaHorario.findMany({
        where: { tripId: { in: sinHorario } },
        orderBy: [{ tripId: 'asc' }, { orden: 'asc' }],
        select: {
          tripId: true,
          orden: true,
          salidaMin: true,
          llegadaMin: true,
          estacion: { select: { nombre: true } },
        },
      });
    }

    return enriquecerSuprimidos(delDia, horarios, extremos);
  }
}
