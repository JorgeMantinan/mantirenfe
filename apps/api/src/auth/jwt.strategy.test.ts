import { describe, expect, it } from 'vitest';
import type { ConfigService } from '@nestjs/config';
import { JwtStrategy } from './jwt.strategy';

const config = {
  get: (clave: string) => (clave === 'SUPABASE_JWT_SECRET' ? 'secreto-de-prueba' : undefined),
} as unknown as ConfigService;

describe('JwtStrategy', () => {
  it('expone validate (passport-jwt no invoca validar)', () => {
    const estrategia = new JwtStrategy(config);
    expect(typeof (estrategia as unknown as { validate?: unknown }).validate).toBe('function');
    expect((estrategia as unknown as { validar?: unknown }).validar).toBeUndefined();
  });

  it('construye el usuario de request a partir del payload', async () => {
    const estrategia = new JwtStrategy(config);
    const usuario = await estrategia.validate({ sub: 'u1', email: 'a@b.c' });
    expect(usuario).toMatchObject({ sub: 'u1', email: 'a@b.c', proveedor: 'email' });
  });

  it('rechaza payloads sin sujeto', async () => {
    const estrategia = new JwtStrategy(config);
    await expect(estrategia.validate({} as never)).rejects.toThrow('Token sin sujeto');
  });
});
