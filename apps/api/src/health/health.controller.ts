import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { getPrisma } from '@mantirenfe/database';
import { EsPublico } from '../common/es-publico.decorator';

@ApiTags('health')
@Controller('health')
export class HealthController {
  @Get()
  @EsPublico()
  async comprobar() {
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
      const redis = new IORedis(redisUrl, { maxRetriesPerRequest: 1, lazyConnect: true });
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

    const sano = estado.baseDatos === 'ok';
    return { estado, sano, timestamp: new Date().toISOString() };
  }
}
