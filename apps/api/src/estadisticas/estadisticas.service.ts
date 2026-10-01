import { Injectable } from '@nestjs/common';
import { getPrisma } from '@mantirenfe/database';
import {
  PERIODO_ESTADISTICAS_DIAS,
  TIPO_AVISO_SIN_TIPO,
  type EstadisticasResponse,
} from '@mantirenfe/shared-types';
import { UsuarioRequest } from '../common/usuario-actual.decorator';

/** Fila del `GROUP BY datos->>'tipo'` sobre `Notificacion` (NULL = sin tipo). */
interface FilaPorTipo {
  tipo: string | null;
  total: number;
}

/**
 * "Tu actividad": avisos de los últimos 30 días agrupados por `datos.tipo` y
 * estado de las alertas del usuario. Dos queries agregadas en paralelo, sin
 * N+1 y sin traer filas a TypeScript: el agregado de avisos se resuelve en SQL
 * (el histórico crece con cada sondeo, no debe descargarse entero).
 */
@Injectable()
export class EstadisticasService {
  async obtener(usuario: UsuarioRequest): Promise<EstadisticasResponse> {
    const prisma = getPrisma();
    const desde = new Date(Date.now() - PERIODO_ESTADISTICAS_DIAS * 24 * 60 * 60 * 1000);

    const [filas, estados] = await Promise.all([
      // Ventana por `creadaEn` (índice `[usuarioId, leida, creadaEn]`).
      prisma.$queryRaw<FilaPorTipo[]>`
        SELECT "datos" ->> 'tipo' AS tipo, COUNT(*)::int AS total
        FROM "Notificacion"
        WHERE "usuarioId" = ${usuario.sub} AND "creadaEn" >= ${desde}
        GROUP BY 1
      `,
      prisma.alerta.groupBy({
        by: ['estado'],
        where: { usuarioId: usuario.sub },
        _count: { _all: true },
      }),
    ]);

    const porTipo: Record<string, number> = {};
    let totalAvisos = 0;
    for (const fila of filas) {
      const total = Number(fila.total);
      if (!Number.isFinite(total) || total <= 0) continue;
      totalAvisos += total;
      // Sin `datos.tipo` (disponibilidad, horario, retraso): un solo cajón.
      const clave = fila.tipo?.trim() || TIPO_AVISO_SIN_TIPO;
      porTipo[clave] = (porTipo[clave] ?? 0) + total;
    }

    const alertas = { total: 0, activas: 0, pausa: 0, completadas: 0 };
    for (const fila of estados) {
      const total = fila._count._all;
      alertas.total += total;
      if (fila.estado === 'ACTIVA') alertas.activas = total;
      else if (fila.estado === 'PAUSA') alertas.pausa = total;
      else if (fila.estado === 'COMPLETADA') alertas.completadas = total;
    }

    return {
      periodoDias: PERIODO_ESTADISTICAS_DIAS,
      avisos: { total: totalAvisos, porTipo },
      alertas,
    };
  }
}
