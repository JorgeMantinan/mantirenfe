import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { getPrisma } from '@mantirenfe/database';
import { Redis } from 'ioredis';
import { EsPublico } from '../common/es-publico.decorator';

/** Minutos sin sondear a partir de los cuales el worker se considera caído. */
const UMBRAL_RETRASO_MINUTOS = 120;
/** Tope del ping a Redis: Render exige la respuesta del health en 5 s. */
const TIMEOUT_PING_MS = 1_500;

/**
 * Cliente Redis ÚNICO para todos los chequeos (lazy init): montar y tirar una
 * conexión TCP por petición es lo más caro del health y gasta file descriptors.
 * El listener de `error` es obligatorio: sin él, un corte del socket emitiría
 * un evento sin manejar y tumbaba el proceso.
 */
let clienteRedis: Redis | null = null;

function clienteRedisCompartido(url: string): Redis {
  if (!clienteRedis) {
    const redis = new Redis(url, {
      maxRetriesPerRequest: 1,
      lazyConnect: true,
      connectTimeout: TIMEOUT_PING_MS,
      commandTimeout: TIMEOUT_PING_MS,
      // Sin cola de comandos: si Redis está caído el ping falla ya y no se acumulan
      enableOfflineQueue: false,
    });
    redis.on('error', () => undefined);
    clienteRedis = redis;
  }
  return clienteRedis;
}

/** Ping con tope de tiempo: el health no puede quedarse esperando al socket. */
async function pingConTimeout(redis: Redis): Promise<void> {
  let temporizador: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      redis.ping(),
      new Promise<never>((_, rechazar) => {
        temporizador = setTimeout(
          () => rechazar(new Error(`Ping a Redis > ${TIMEOUT_PING_MS} ms`)),
          TIMEOUT_PING_MS,
        );
      }),
    ]);
  } finally {
    if (temporizador) clearTimeout(temporizador);
  }
}

/** Estado del ping a Redis para el health (`ok` o `error`). */
async function comprobarRedis(url: string): Promise<'ok' | 'error'> {
  try {
    const redis = clienteRedisCompartido(url);
    // Con `lazyConnect` el cliente no conecta solo: lo abre el primer chequeo
    if (redis.status === 'wait') await redis.connect();
    await pingConTimeout(redis);
    return 'ok';
  } catch {
    return 'error';
  }
}

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
      estado.redis = await comprobarRedis(redisUrl);
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
