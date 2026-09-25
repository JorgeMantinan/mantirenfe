import { createPublicKey, type KeyObject } from 'node:crypto';
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

/**
 * Supabase moderno firma los access tokens con ES256 y su "JWT Secret" es la
 * clave pública EC P-256 en crudo (64 bytes, base64 de 86-88 caracteres).
 * Convierte ese formato a PEM SPKI para poder verificar con jsonwebtoken.
 * Devuelve null si el secret no tiene ese formato (proyecto legacy HS256).
 */
export function pemSiClaveEc(secret: string): string | null {
  try {
    const normalizado = secret.replace(/-/g, '+').replace(/_/g, '/').replace(/\s/g, '');
    const crudo = Buffer.from(normalizado, 'base64');
    if (crudo.length !== 64 && crudo.length !== 65) return null;
    const punto = crudo.length === 65 ? crudo : Buffer.concat([Buffer.from([0x04]), crudo]);
    const der = Buffer.concat([
      Buffer.from('3059301306072a8648ce3d020106082a8648ce3d030107034200', 'hex'),
      punto,
    ]);
    const pem = `-----BEGIN PUBLIC KEY-----\n${der
      .toString('base64')
      .replace(/(.{64})/g, '$1\n')}\n-----END PUBLIC KEY-----`;
    const clave: KeyObject = createPublicKey(pem); // valida que la clave sea correcta
    if (clave.asymmetricKeyType !== 'ec') return null;
    return pem;
  } catch {
    return null;
  }
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(config: ConfigService) {
    const secreto =
      config.get<string>('SUPABASE_JWT_SECRET') ?? config.get<string>('JWT_SECRET') ?? '';
    const pem = pemSiClaveEc(secreto);
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      ...(pem
        ? { secretOrKey: pem, algorithms: ['ES256'] as const }
        : { secretOrKey: secreto, algorithms: ['HS256'] as const }),
    });
  }

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
