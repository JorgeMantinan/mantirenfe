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
  // Con Vercel/Render delante, la IP real viene en X-Forwarded-For y hay que
  // decirle a Express en cuántos saltos confiar: en local basta 1, en producción
  // la petición pasa por el edge de Vercel y luego por Render (TRUST_PROXY_HOPS=2).
  // Si el número de saltos no coincide, el rate limit por IP agrupa a todos los
  // usuarios en el mismo bucket (o confía en una IP que el cliente puede falsear).
  const saltosProxy = Number(process.env.TRUST_PROXY_HOPS ?? 1);
  app
    .getHttpAdapter()
    .getInstance()
    .set(
      'trust proxy',
      Number.isFinite(saltosProxy) && saltosProxy >= 0 ? Math.trunc(saltosProxy) : 1,
    );
  // No fingerprintar el stack (audit de seguridad)
  app.getHttpAdapter().getInstance().disable('x-powered-by');
  app.use(
    (
      _req: import('express').Request,
      res: import('express').Response,
      next: import('express').NextFunction,
    ) => {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-Frame-Options', 'DENY');
      res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
      res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
      next();
    },
  );

  app.use(
    pinoHttp({
      logger,
      autoLogging: process.env.NODE_ENV !== 'test',
      customLogLevel: (req, res, err) =>
        err || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info',
    }),
  );

  // La API solo acepta Bearer (sin cookies): `credentials` sobra y abre la
  // puerta a CSRF si algún día se colase una cookie.
  const orígenes = (process.env.WEB_ORIGIN ?? 'http://localhost:5173')
    .split(',')
    .map((origen) => origen.trim())
    .filter((origen) => origen !== '');
  app.enableCors({ origin: orígenes });
  app.setGlobalPrefix('api');

  // Swagger fuera en producción salvo que se habilite explícitamente
  if (process.env.NODE_ENV !== 'production' || process.env.SWAGGER_ENABLED === 'true') {
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
  }

  const puerto = Number(process.env.API_PORT ?? 3000);
  await app.listen(puerto);
  logger.info({ puerto }, 'API MantiRenfe escuchando');
}

void bootstrap();
