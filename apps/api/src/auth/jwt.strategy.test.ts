import { describe, expect, it } from 'vitest';
import {
  createPublicKey,
  generateKeyPairSync,
  sign as firmarEc,
  verify as verificarEc,
} from 'node:crypto';
import type { ConfigService } from '@nestjs/config';
import { JwtStrategy, pemSiClaveEc } from './jwt.strategy';

const config = {
  get: (clave: string) => (clave === 'SUPABASE_JWT_SECRET' ? 'secreto-de-prueba' : undefined),
} as unknown as ConfigService;

function secretEcSimulado(): string {
  const { publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const der = publicKey.export({ type: 'spki', format: 'der' }) as Buffer;
  // SPKI de P-256 = cabecera(26) + punto(65) -> los últimos64 son X||Y (crudo de Supabase)
  return der.subarray(der.length - 64).toString('base64');
}

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

  it('construye con un secret EC (formato Supabase ES256) sin fallar', () => {
    const configEc = {
      get: (clave: string) => (clave === 'SUPABASE_JWT_SECRET' ? secretEcSimulado() : undefined),
    } as unknown as ConfigService;
    const estrategia = new JwtStrategy(configEc);
    expect(typeof (estrategia as unknown as { validate?: unknown }).validate).toBe('function');
  });
});

describe('pemSiClaveEc', () => {
  it('convierte el secreto crudo de Supabase en un PEM que verifica firmas ES256', () => {
    const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    const der = publicKey.export({ type: 'spki', format: 'der' }) as Buffer;
    const secreto = der.subarray(der.length - 64).toString('base64');

    const pem = pemSiClaveEc(secreto);
    expect(pem).toContain('BEGIN PUBLIC KEY');

    // El PEM resultante verifica una firma ECDSA real hecha con la privada
    const dato = Buffer.from('payload-de-prueba');
    const firma = firmarEc('sha256', dato, privateKey);
    expect(verificarEc('sha256', dato, createPublicKey(pem!), firma)).toBe(true);
  });

  it('devuelve null para secrets que no son clave EC (legacy HS256)', () => {
    expect(pemSiClaveEc('secreto-de-prueba')).toBeNull();
    expect(pemSiClaveEc('dev-secret-cambiado-1234')).toBeNull();
    expect(pemSiClaveEc('')).toBeNull();
  });
});
