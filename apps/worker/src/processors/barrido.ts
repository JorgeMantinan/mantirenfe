import type { Logger } from 'pino';
import type { getPrisma } from '@mantirenfe/database';
import { esDiaAplicable } from './reloj';

/**
 * ¿Toca sondear esta alerta en el barrido de este minuto?
 *
 * - Las recurrentes CON `diasSemana` marcado NO se descartan en días no
 *   aplicables: su fecha objetivo es el próximo día marcado
 *   (`proximoDiaAplicable`), así que un martes se sondea el viernes para
 *   avisar en cuanto haya plaza. La frecuencia la limita `intervaloSondeoMin`.
 * - El resto (no recurrentes, recurrentes sin días marcados y las legadas
 *   `soloLaborables` con `diasSemana` vacío) mantiene el filtro de siempre,
 *   `esDiaAplicable`.
 * - Sin sondeo previo entra ya; con sondeo previo, cuando pasó su intervalo.
 */
export function esPendienteDeSondeo(
  alerta: {
    recurrente?: boolean | null;
    diasSemana?: number[] | readonly number[] | null;
    soloLaborables?: boolean | null;
    ultimoSondeoEn?: Date | null;
    intervaloSondeoMin?: number | null;
  },
  ahoraGtfs: Date,
  ahoraMs: number = Date.now(),
): boolean {
  const recurrenteConDias = alerta.recurrente === true && (alerta.diasSemana?.length ?? 0) > 0;
  if (!recurrenteConDias && !esDiaAplicable(alerta, ahoraGtfs)) return false;
  if (!alerta.ultimoSondeoEn) return true;
  const intervaloMin = alerta.intervaloSondeoMin ?? 10;
  return ahoraMs - alerta.ultimoSondeoEn.getTime() >= intervaloMin * 60_000;
}

/**
 * Reset diario de las alertas recurrentes al cruzar la medianoche peninsular:
 * limpia los avisos del día (recordatorio y resumen) para que cada día puedan
 * volver a enviarse, y deja `ultimoSondeoEn` a null para que el barrido la
 * sondee ya (esa marca es también lo que evita repetir el reset: la condición
 * excluye las filas sin sondeo).
 *
 * `ultimoEstado` ya NO se borra aquí. Desde que una recurrente con días
 * marcados evalúa el PRÓXIMO día marcado, su estado es continuo mientras la
 * fecha objetivo no cambie: borrarlo a diario perdería la transición
 * «sin plazas → con plazas» del próximo viernes y re-avisaría de más al
 * recomponer la línea base. El baseline de una fecha objetivo nueva lo decide
 * `sondearAlerta`, que compara `Alerta.fechaObjetivoSondeo` con la que toca y
 * trata el estado anterior como primer sondeo (y lo guarda con la fecha nueva
 * en la misma transacción). Así el reset deja de ser crítico para el diff.
 *
 * Devuelve el nº de alertas reiniciadas (0 si la operación falla: el próximo
 * barrido lo reintenta).
 */
export async function resetearRecurrentes(
  prisma: ReturnType<typeof getPrisma>,
  hoy00: Date,
  logger: Logger,
): Promise<number> {
  try {
    const reseteadas = await prisma.alerta.updateMany({
      where: {
        recurrente: true,
        estado: 'ACTIVA',
        ultimoSondeoEn: { lt: hoy00 },
        NOT: { ultimoSondeoEn: null },
      },
      data: {
        ultimoSondeoEn: null,
        recordatorioTrenesEnviados: [],
        recordatorioEnviadoEn: null,
        resumenEnviadoEn: null,
      },
    });
    if (reseteadas.count > 0) {
      logger.info({ reseteadas: reseteadas.count }, 'Alertas recurrentes reiniciadas hoy');
    }
    return reseteadas.count;
  } catch (error) {
    logger.error({ err: error }, 'Fallo reiniciando alertas recurrentes');
    return 0;
  }
}
