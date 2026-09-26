import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import { ES_PUBLICO_KEY } from '../common/es-publico.decorator';

interface PayloadJwt extends JWTPayload {
  sub: string;
  email?: string;
  user_metadata?: {
    full_name?: string;
    avatar_url?: string;
  };
  app_metadata?: {
    provider?: string;
  };
}

/**
 * Guard de autenticación propio (sin passport): verifica los access tokens de
 * Supabase contra su JWKS público (fuente canónica de la clave ES256, se
 * autorefresca y no depende de un "JWT Secret" copiado a mano).
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly supabaseUrl: string;
  private readonly jwks: ReturnType<typeof createRemoteJWKSet> | null;

  constructor(
    private readonly reflector: Reflector,
    config: ConfigService,
  ) {
    this.supabaseUrl = (config.get<string>('SUPABASE_URL') ?? '').replace(/\/+$/, '');
    this.jwks = this.supabaseUrl
      ? createRemoteJWKSet(new URL(`${this.supabaseUrl}/auth/v1/.well-known/jwks.json`), {
          timeoutDuration: 8_000,
          cooldownDuration: 60_000,
          cacheMaxAge: 60 * 60 * 1000,
        })
      : null;
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const esPublico = this.reflector.getAllAndOverride<boolean>(ES_PUBLICO_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (esPublico) return true;

    const request = context
      .switchToHttp()
      .getRequest<{ headers: Record<string, string | undefined>; user?: unknown }>();

    if (!this.supabaseUrl || !this.jwks) {
      throw new UnauthorizedException('SUPABASE_URL no configurada en la API');
    }
    const token = extraerToken(request.headers.authorization);
    if (!token) {
      throw new UnauthorizedException('Token ausente: la petición no lleva cabecera Authorization');
    }

    try {
      const { payload } = await jwtVerify(token, this.jwks, { algorithms: ['ES256'] });
      const p = payload as PayloadJwt;
      if (!p.sub) throw new UnauthorizedException('Token sin sujeto');
      request.user = {
        sub: p.sub,
        email: p.email ?? '',
        nombre: p.user_metadata?.full_name ?? null,
        avatarUrl: p.user_metadata?.avatar_url ?? null,
        proveedor: p.app_metadata?.provider ?? 'email',
      };
      return true;
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      const mensaje = error instanceof Error ? error.message : String(error);
      if (mensaje.includes('expir')) {
        throw new UnauthorizedException('La sesión ha expirado: vuelve a iniciar sesión');
      }
      if (
        mensaje.includes('JWKS') ||
        mensaje.includes('fetch') ||
        mensaje.includes('network') ||
        mensaje.includes('ENOTFOUND')
      ) {
        throw new UnauthorizedException('No se pudo verificar el token (JWKS no accesible)');
      }
      throw new UnauthorizedException(`Token inválido (${mensaje})`);
    }
  }
}

function extraerToken(authorization: string | undefined): string | null {
  if (!authorization) return null;
  const [tipo, token] = authorization.split(' ');
  if (tipo?.toLowerCase() !== 'bearer' || !token) return null;
  return token;
}
