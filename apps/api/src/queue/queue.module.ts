import { Global, Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { COLA_SONDEO, COLA_SONDEO_MASIVO, COLA_SYNC_GTFS } from '@mantirenfe/shared-types';

@Global()
@Module({
  imports: [
    BullModule.forRoot({
      connection: {
        url: process.env.REDIS_URL ?? 'redis://localhost:6379',
        maxRetriesPerRequest: null,
      },
    }),
    BullModule.registerQueue(
      { name: COLA_SONDEO },
      { name: COLA_SONDEO_MASIVO },
      { name: COLA_SYNC_GTFS },
    ),
  ],
  exports: [BullModule],
})
export class QueueModule {}
