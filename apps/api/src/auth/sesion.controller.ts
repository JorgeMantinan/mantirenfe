import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { EsPublico } from '../common/es-publico.decorator';
import { cookiesBorrado, cookiesSeguras, cookiesSesion, leerCookies } from './cookies';
import { SesionService, type SesionWeb } from './sesion.service';

/**
 * BFF de cookies: la sesión vive en cookies httpOnly y la web solo recibe el
 * access token en el cuerpo de `GET /auth/session` (para mandarlo como
 * `Authorization: Bearer` en memoria). Todo es `@EsPublico()`: la credencial
 * es la cookie, no el Bearer que valida `JwtAuthGuard`.
 */
const loginSchema = z.object({
  email: z.string().trim().min(3).max(254).email(),
  password: z.string().min(1).max(256),
});

/** Códigos de Supabase: acotados y sin huecos para montar peticiones raras. */
const codigoValido = z
  .string()
  .min(1)
  .max(4096)
  .refine((valor) => !/[\s<>"'\\]/.test(valor), 'Código inválido');

const callbackSchema = z.object({
  code: codigoValido,
  code_verifier: z
    .string()
    .min(10)
    .max(512)
    .refine((valor) => !/[\s<>"'\\]/.test(valor), 'Verifier inválido'),
});

@ApiTags('auth')
@Controller('auth')
export class SesionController {
  constructor(
    private readonly sesionService: SesionService,
    private readonly config: ConfigService,
  ) {}

  // OJO: `@Res` es argumento de RUTA, no de DI — en el constructor Nest intenta
  // inyectar `Response` y el arranque revienta ("can't resolve dependencies").
  @Post('login')
  @HttpCode(200)
  @EsPublico()
  @Throttle({ default: { ttl: 10_000, limit: 10 } })
  async login(
    @Body() cuerpo: unknown,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ ok: true }> {
    const parsed = loginSchema.safeParse(cuerpo);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten().fieldErrors);
    }
    const tokens = await this.sesionService.login(parsed.data.email, parsed.data.password);
    res.setHeader('Set-Cookie', cookiesSesion(tokens, this.secure()));
    return { ok: true };
  }

  @Post('callback')
  @HttpCode(200)
  @EsPublico()
  @Throttle({ default: { ttl: 10_000, limit: 10 } })
  async callback(
    @Body() cuerpo: unknown,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ ok: true }> {
    const parsed = callbackSchema.safeParse(cuerpo);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten().fieldErrors);
    }
    const tokens = await this.sesionService.canjearCodigo(
      parsed.data.code,
      parsed.data.code_verifier,
    );
    res.setHeader('Set-Cookie', cookiesSesion(tokens, this.secure()));
    return { ok: true };
  }

  @Get('session')
  @EsPublico()
  async session(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ session: SesionWeb | null }> {
    // Sin caché: la respuesta lleva un access token en el cuerpo
    res.setHeader('Cache-Control', 'no-store');
    const cookies = leerCookies(req.headers.cookie);
    const { sesion, renovado, cookiesInvalidas } =
      await this.sesionService.sesionDeCookies(cookies);
    const secure = this.secure();
    if (renovado) res.setHeader('Set-Cookie', cookiesSesion(renovado, secure));
    else if (cookiesInvalidas) res.setHeader('Set-Cookie', cookiesBorrado(secure));
    return { session: sesion };
  }

  @Post('logout')
  @HttpCode(200)
  @EsPublico()
  async logout(@Res({ passthrough: true }) res: Response): Promise<{ ok: true }> {
    res.setHeader('Set-Cookie', cookiesBorrado(this.secure()));
    return { ok: true };
  }

  /** `Secure` solo en producción (en http local rompería el alta de cookies). */
  private secure(): boolean {
    return cookiesSeguras(this.config.get<string>('NODE_ENV'));
  }
}
