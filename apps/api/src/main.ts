import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import * as Sentry from '@sentry/node';
import pino from 'pino';
import { pinoHttp } from 'pino-http';
import { AppModule } from './app.module';
import { NestPinoLogger } from './common/nest-pino.logger';

async function bootstrap() {
  if (process.env.SENTRY_DSN) {
    Sentry.init({ dsn: process.env.SENTRY_DSN, tracesSampleRate: 0.1 });
  }

  const logger = pino({
    level: process.env.LOG_LEVEL ?? 'info',
    ...(process.env.NODE_ENV !== 'production'
      ? { transport: { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss' } } }
      : {}),
  });

  const app = await NestFactory.create(AppModule, { logger: new NestPinoLogger(logger) });

  app.use(
    pinoHttp({
      logger,
      autoLogging: process.env.NODE_ENV !== 'test',
      customLogLevel: (req, res, err) =>
        err || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info',
    }),
  );

  const orígenes = (process.env.WEB_ORIGIN ?? 'http://localhost:5173').split(',');
  app.enableCors({ origin: orígenes, credentials: true });
  app.setGlobalPrefix('api');

  const swaggerConfig = new DocumentBuilder()
    .setTitle('MantiRenfe API')
    .setDescription('API REST de MantiRenfe: alertas de trenes, notificaciones y datos Renfe')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: { persistAuthorization: true },
  });

  const puerto = Number(process.env.API_PORT ?? 3000);
  await app.listen(puerto);
  logger.info({ puerto }, 'API MantiRenfe escuchando');
}

void bootstrap();
