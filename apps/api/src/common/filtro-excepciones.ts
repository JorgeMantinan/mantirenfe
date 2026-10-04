import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import * as Sentry from '@sentry/node';

/** Mensaje fijo para lo que no es una `HttpException`: nada de textos internos. */
const MENSAJE_INTERNO = 'Error interno';
/** Cuerpo legible para un 400 con detalle de validación (p. ej. zod `flatten()`). */
const MENSAJE_INVALIDOS = 'Datos inválidos';

/** Texto legible de `message` (Nest admite string o lista de strings). */
function textoDe(message: unknown): string | null {
  if (typeof message === 'string' && message !== '') return message;
  if (Array.isArray(message)) {
    const textos = message.filter((item): item is string => typeof item === 'string');
    if (textos.length > 0) return textos.join(', ');
  }
  return null;
}

/**
 * Cuerpo JSON de la respuesta:
 *  - `error` (texto) es el campo que leen web y móvil;
 *  - `message` es el mismo texto en el formato estándar de Nest;
 *  - si la excepción trae un objeto entero (el `flatten()` de zod, que NO tiene
 *    `message`), se devuelve como `detalles` sin perder el `message` legible.
 */
function cuerpoDeHttp(exception: HttpException): Record<string, unknown> {
  const respuesta = exception.getResponse();
  if (typeof respuesta === 'string') {
    return { error: respuesta, message: respuesta };
  }
  if (typeof respuesta === 'object' && respuesta !== null) {
    const objeto = respuesta as Record<string, unknown>;
    const message = textoDe(objeto.message);
    if (message !== null) return { ...objeto, error: message };
    // Objeto sin `message`: el mensaje propio de la excepción solo es fiable en
    // un 400 (ahí es donde se lanza con el detalle de la validación).
    const legible =
      exception.getStatus() === HttpStatus.BAD_REQUEST ? MENSAJE_INVALIDOS : exception.message;
    return { error: legible, message: legible, detalles: objeto };
  }
  const legible = exception.message || MENSAJE_INTERNO;
  return { error: legible, message: legible };
}

@Catch()
export class FiltroExcepcionesGlobal implements ExceptionFilter {
  private readonly logger = new Logger(FiltroExcepcionesGlobal.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<{ url?: string }>();
    const response = ctx.getResponse<Response>();

    const status =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const cuerpo =
      exception instanceof HttpException
        ? cuerpoDeHttp(exception)
        : { error: MENSAJE_INTERNO, message: MENSAJE_INTERNO };

    // Trazabilidad SIEMPRE (también en los 4xx): ruta, estado y el error tal cual
    const detalle = exception instanceof Error ? exception.stack : String(exception);
    this.logger.error(`Ruta ${request?.url ?? '-'} → HTTP ${status}: ${detalle}`);

    // Sentry solo para fallos de servidor: los 4xx son ruido del cliente
    if (status >= 500) Sentry.captureException(exception);

    response.status(status).json(cuerpo);
  }
}
