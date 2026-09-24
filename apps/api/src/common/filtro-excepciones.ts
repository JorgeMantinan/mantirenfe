import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import type { Response } from 'express';
import * as Sentry from '@sentry/node';

@Catch()
export class FiltroExcepcionesGlobal implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let mensaje = 'Error interno del servidor';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const respuesta = exception.getResponse();
      if (typeof respuesta === 'string') {
        mensaje = respuesta;
      } else if (typeof respuesta === 'object' && respuesta !== null && 'message' in respuesta) {
        const message = (respuesta as { message?: string | string[] }).message;
        mensaje = Array.isArray(message) ? message.join(', ') : (message ?? exception.message);
      } else {
        mensaje = exception.message;
      }
    } else if (exception instanceof Error) {
      Sentry.captureException(exception);
      if (process.env.NODE_ENV !== 'production') mensaje = exception.message;
    }

    response.status(status).json({ error: mensaje });
  }
}
