import { describe, expect, it } from 'vitest';
import { traducirErrorAuth } from '../errores-auth';

describe('traducirErrorAuth', () => {
  it('traduce los errores habituales de Supabase Auth', () => {
    expect(traducirErrorAuth('Invalid login credentials')).toContain('Email o contraseña');
    expect(traducirErrorAuth('Email not confirmed')).toContain('confirmar el email');
    expect(traducirErrorAuth('User already registered')).toContain('Ya existe una cuenta');
    expect(traducirErrorAuth('Unsupported provider: provider is not enabled')).toContain(
      'no está habilitado',
    );
    expect(traducirErrorAuth('Email address "x@y.es" is invalid')).toContain('Supabase no acepta');
    expect(traducirErrorAuth('Password should be at least 6 characters')).toContain('8 caracteres');
    expect(traducirErrorAuth('Too many requests')).toContain('Demasiados intentos');
  });

  it('devuelve el mensaje original si no lo reconoce', () => {
    expect(traducirErrorAuth('algo raro que no conocemos')).toBe('algo raro que no conocemos');
  });
});
