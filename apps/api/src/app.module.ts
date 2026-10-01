import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AlertasModule } from './alertas/alertas.module';
import { AuthModule } from './auth/auth.module';
import { EstacionesModule } from './estaciones/estaciones.module';
import { EstadisticasModule } from './estadisticas/estadisticas.module';
import { FiltroExcepcionesGlobal } from './common/filtro-excepciones';
import { HealthModule } from './health/health.module';
import { IncidenciasModule } from './incidencias/incidencias.module';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { NotificacionesModule } from './notificaciones/notificaciones.module';
import { QueueModule } from './queue/queue.module';
import { SuprimidosModule } from './suprimidos/suprimidos.module';
import { TrenesModule } from './trenes/trenes.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../../.env'],
    }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 60 }]),
    QueueModule,
    HealthModule,
    AuthModule,
    AlertasModule,
    NotificacionesModule,
    EstacionesModule,
    TrenesModule,
    IncidenciasModule,
    SuprimidosModule,
    EstadisticasModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_FILTER, useClass: FiltroExcepcionesGlobal },
  ],
})
export class AppModule {}
