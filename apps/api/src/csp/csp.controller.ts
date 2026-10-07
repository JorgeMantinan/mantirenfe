import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { NextFunction, Request, Response } from 'express';
import pino from 'pino';
import { EsPublico } from '../common/es-publico.decorator';

/**
 * Tope del cuerpo que se guarda en memoria. Un informe CSP de verdad pesa ~1 KB
 * y la ruta es pública, así que cualquiera puede pegarle con POST enormes.
 */
const LIMITE_CUERPO = 4096;

/** Content-types con los que los navegadores envían los informes de `report-uri`. */
const TIPOS_INFORME = new Set(['application/csp-report', 'application/reports+json']);

/**
 * Logger propio: la instancia de `main.ts` vive dentro de `bootstrap()` y
 * importar ese fichero arrancaría la app. Mismo formato que el de `main.ts`.
 */
const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  ...(process.env.NODE_ENV !== 'production'
    ? { transport: { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss' } } }
    : {}),
});

/** Express solo marca el cuerpo como leído con `_body` (no está en los tipos). */
type RequestConCuerpo = Request & { _body?: boolean };

/**
 * Se monta en `main.ts` con `app.use(informeCsp)`. Los parsers de Express solo
 * entienden `application/json` y urlencoded, así que un `application/csp-report`
 * llegaría al controlador sin cuerpo: se lee el stream a mano, truncado, y se
 * marca `req._body` para que los parsers de Nest no vuelvan a consumirlo.
 */
export function informeCsp(req: Request, res: Response, next: NextFunction): void {
  const cabecera = req.headers['content-type'];
  const contenido = Array.isArray(cabecera) ? cabecera.join(';') : (cabecera ?? '');
  const tipo = contenido.split(';')[0]?.trim().toLowerCase() ?? '';
  if (req.method !== 'POST' || !TIPOS_INFORME.has(tipo) || (req as RequestConCuerpo)._body) {
    next();
    return;
  }

  // Solo la ruta del endpoint: el resto de rutas no debe pagar el parser.
  if (req.path !== '/api/csp-report' && req.path !== '/csp-report') {
    next();
    return;
  }

  // Tope por cabecera: ni se abre el stream (antes se descargaba el cuerpo entero)
  const largo = Number(req.headers['content-length'] ?? '0');
  if (Number.isFinite(largo) && largo > LIMITE_CUERPO) {
    res.statusCode = 413;
    res.end();
    return;
  }

  const peticion = req as RequestConCuerpo;
  let cuerpo = '';
  let cortado = false;
  peticion.setEncoding('utf8');

  const acumular = (fragmento: string) => {
    if (cortado) return;
    if (cuerpo.length >= LIMITE_CUERPO) {
      // Cuerpo mayor que el tope: se corta la conexión en vez de seguir
      // descargando gigabytes en un contenedor de 512 MB.
      cortado = true;
      peticion.destroy();
      return;
    }
    cuerpo += fragmento.slice(0, LIMITE_CUERPO - cuerpo.length);
  };
  const terminar = () => {
    if (cortado) return;
    peticion.body = cuerpo;
    peticion._body = true;
    next();
  };

  peticion.on('data', acumular);
  peticion.on('end', terminar);
  peticion.on('error', terminar);
}

@ApiTags('csp')
@Controller('csp-report')
export class CspController {
  /**
   * Destino de `report-uri`. Solo deja constancia en el log: nunca lanza (un
   * informe mal formado no puede tumbar la API) y responde 204 sin cuerpo.
   */
  @Post()
  @EsPublico()
  // Ruta pública: sin tope, un atacante martillea el log (4 KB/petición)
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  @HttpCode(204)
  recibir(@Body() cuerpo: unknown): void {
    logger.warn({ informe: aInformable(cuerpo) }, 'CSP violation');
  }
}

/** Body → objeto logueable: trunca a `LIMITE_CUERPO` y no falla si no es JSON. */
function aInformable(cuerpo: unknown): unknown {
  if (typeof cuerpo === 'string') return parsearSeguro(cuerpo);
  if (cuerpo === undefined || cuerpo === null) return null;
  try {
    const texto = JSON.stringify(cuerpo);
    return texto === undefined ? null : parsearSeguro(texto);
  } catch {
    // Objetos no serializables (cíclicos, en principio imposibles desde un body)
    return { crudo: String(cuerpo).slice(0, LIMITE_CUERPO) };
  }
}

function parsearSeguro(texto: string): unknown {
  const truncado = texto.length > LIMITE_CUERPO ? texto.slice(0, LIMITE_CUERPO) : texto;
  try {
    return JSON.parse(truncado) as unknown;
  } catch {
    // Body cortado por el tope o basura: se registra tal cual, sin lanzar
    return { crudo: truncado };
  }
}
