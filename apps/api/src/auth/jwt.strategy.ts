import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

interface PayloadJwt {
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

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(config: ConfigService) {
    const secreto =
      config.get<string>('SUPABASE_JWT_SECRET') ?? config.get<string>('JWT_SECRET') ?? '';
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secreto,
    });
  }

  // passport-jwt invoca `validate` (no `validar`); si no existe, todas las
  // rutas protegidas devuelven 500 con "this.validate is not a function".
  async validate(payload: PayloadJwt) {
    if (!payload?.sub) {
      throw new UnauthorizedException('Token sin sujeto');
    }
    return {
      sub: payload.sub,
      email: payload.email ?? '',
      nombre: payload.user_metadata?.full_name ?? null,
      avatarUrl: payload.user_metadata?.avatar_url ?? null,
      proveedor: payload.app_metadata?.provider ?? 'email',
    };
  }
}
