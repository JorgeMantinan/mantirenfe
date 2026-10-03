import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { getPrisma } from '@mantirenfe/database';
import { EsPublico } from '../common/es-publico.decorator';

/** Minutos sin sondear a partir de los cuales el worker se considera caído. */
const UMBRAL_RETRASO_MINUTOS = 120;

type ResumenAlertas = {
  /** Alertas en estado ACTIVA (null si la consulta falló). */
  activas: number | null;
  /** `Alerta.ultimoSondeoEn` más reciente entre las activas (ISO o null). */
  ultimoSondeoEn: string | null;
  /** Minutos transcurridos desde ese sondeo (0 = sin trabajo pendiente). */
  retrasoMinutos: number | null;
};

@ApiTags('health')
@Controller('health')
export class HealthController {
  /** Caché corta: Render exige respuesta en5s y no deja subir el timeout en free. */
  private cache: { en: number; valor: unknown } | null = null;

  @Get()
  @EsPublico()
  async comprobar() {
    if (this.cache && Date.now() - this.cache.en < 10_000) {
      return this.cache.valor;
    }

    const estado: Record<string, string> = { api: 'ok' };

    try {
      await getPrisma().$queryRaw`SELECT 1`;
      estado.baseDatos = 'ok';
    } catch {
      estado.baseDatos = 'error';
    }

    const redisUrl = process.env.REDIS_URL;
    if (redisUrl) {
      const { default: IORedis } = await import('ioredis');
      const redis = new IORedis(redisUrl, {
        maxRetriesPerRequest: 1,
        lazyConnect: true,
        connectTimeout: 1_500,
        commandTimeout: 1_500,
      });
      try {
        await redis.connect();
        await redis.ping();
        estado.redis = 'ok';
      } catch {
        estado.redis = 'error';
      } finally {
        redis.disconnect();
      }
    } else {
      estado.redis = 'no-configurado';
    }

    const alertas = await this.resumenSondeo();
    const sano = estado.baseDatos === 'ok';
    const respuesta = {
      estado,
      sano,
      timestamp: new Date().toISOString(),
      ultimoSondeoGlobal: alertas.ultimoSondeoEn,
      alertas,
      umbralRetrasoMinutos: UMBRAL_RETRASO_MINUTOS,
      // Sin métricas de memoria en el health público (fingerprint para atacantes);
      // la memoria del worker está en sus logs de Render.
    };
    this.cache = { en: Date.now(), valor: respuesta };
    return respuesta;
  }

  /**
   * Corazón del worker: 1 única consulta de agregado sobre `Alerta` (índice
   * `[estado, ultimoSondeoEn]`). Nunca lanza: si falla, devuelve campos nulos
   * para no tumbar el health check.
   */
  private async resumenSondeo(): Promise<ResumenAlertas> {
    try {
      const agregado = await getPrisma().alerta.aggregate({
        where: { estado: 'ACTIVA' },
        _count: { _all: true },
        _max: { ultimoSondeoEn: true },
      });

      const activas = agregado._count._all;
      const ultimoSondeo = agregado._max.ultimoSondeoEn;

      if (!ultimoSondeo) {
        // Sin sondeos previos: 0 si no hay trabajo pendiente, null si lo hay
        // (un monitor puede alertar con `alertas.ultimoSondeoEn == null`).
        return { activas, ultimoSondeoEn: null, retrasoMinutos: activas > 0 ? null : 0 };
      }

      const retrasoMinutos = Math.max(
        0,
        Math.floor((Date.now() - ultimoSondeo.getTime()) / 60_000),
      );
      return {
        activas,
        ultimoSondeoEn: ultimoSondeo.toISOString(),
        retrasoMinutos,
      };
    } catch {
      return { activas: null, ultimoSondeoEn: null, retrasoMinutos: null };
    }
  }
}
