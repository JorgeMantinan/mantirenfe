import { describe, expect, it, vi } from 'vitest';
import type { ExecutionContext } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { Reflector } from '@nestjs/core';
import { jwtVerify } from 'jose';
import { JwtAuthGuard } from './jwt-auth.guard';

vi.mock('jose', () => ({
  createRemoteJWKSet: vi.fn(() => 'jwks-mock'),
  jwtVerify: vi.fn(async () => ({ payload: { sub: 'u1', email: 'a@b.c' } })),
}));

const config = {
  get: (clave: string) => (clave === 'SUPABASE_URL' ? 'https://test.supabase.co' : undefined),
} as unknown as ConfigService;

const reflector = {
  getAllAndOverride: vi.fn(() => false),
} as unknown as Reflector;

function contexto(authorization?: string): ExecutionContext {
  const request: { headers: Record<string, string | undefined>; user?: unknown } = {
    headers: authorization ? { authorization } : {},
  };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => () => undefined,
    getClass: () => class Controlador {},
  } as unknown as ExecutionContext;
}

function crearGuard(): JwtAuthGuard {
  return new JwtAuthGuard(reflector, config);
}

describe('JwtAuthGuard', () => {
  it('permite las rutas públicas sin token', async () => {
    vi.mocked(reflector.getAllAndOverride).mockReturnValueOnce(true);
    const guard = crearGuard();
    await expect(guard.canActivate(contexto())).resolves.toBe(true);
  });

  it('sin cabecera: token ausente con mensaje claro', async () => {
    const guard = crearGuard();
    await expect(guard.canActivate(contexto())).rejects.toThrow('Token ausente');
  });

  it('con token verificable: concede y mapea el usuario en request.user', async () => {
    vi.mocked(jwtVerify).mockResolvedValueOnce({
      payload: { sub: 'u9', email: 'b@c.d', user_metadata: { full_name: 'Ana' } },
    } as never);
    const guard = crearGuard();
    const ctx = contexto('Bearer tok');
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    const request = ctx.switchToHttp().getRequest<{ user: unknown }>();
    expect(request.user).toMatchObject({ sub: 'u9', email: 'b@c.d', nombre: 'Ana' });
  });

  it('token caducado: mensaje de expiración', async () => {
    vi.mocked(jwtVerify).mockRejectedValueOnce(new Error('jwt expired'));
    const guard = crearGuard();
    await expect(guard.canActivate(contexto('Bearer tok'))).rejects.toThrow('expirado');
  });

  it('token con firma inválida: mensaje con el detalle', async () => {
    vi.mocked(jwtVerify).mockRejectedValueOnce(new Error('signature verification failed'));
    const guard = crearGuard();
    await expect(guard.canActivate(contexto('Bearer tok'))).rejects.toThrow('Token inválido');
  });

  it('token mal formado: rechaza', async () => {
    const guard = crearGuard();
    await expect(guard.canActivate(contexto('Basic otro'))).rejects.toThrow('Token ausente');
  });
});
