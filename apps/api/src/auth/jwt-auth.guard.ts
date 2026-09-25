import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { ES_PUBLICO_KEY } from '../common/es-publico.decorator';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  override canActivate(context: ExecutionContext) {
    const esPublico = this.reflector.getAllAndOverride<boolean>(ES_PUBLICO_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (esPublico) return true;
    return super.canActivate(context);
  }

  override handleRequest<T>(err: Error | null, user: T, info?: unknown): T {
    if (err) throw err;
    if (user) return user;

    // Distinguimos el motivo para que el cliente sepa qué mirar
    const mensaje =
      typeof info === 'object' && info !== null && 'message' in info
        ? String((info as { message?: unknown }).message)
        : '';
    if (mensaje.includes('jwt expired')) {
      throw new UnauthorizedException('La sesión ha expirado: vuelve a iniciar sesión');
    }
    if (mensaje.includes('invalid signature') || mensaje.includes('invalid token')) {
      throw new UnauthorizedException(
        'Firma del token inválida (revisa SUPABASE_JWT_SECRET en la API)',
      );
    }
    if (!mensaje) {
      throw new UnauthorizedException('Token ausente: la petición no lleva cabecera Authorization');
    }
    throw new UnauthorizedException(`Token inválido (${mensaje})`);
  }
}
