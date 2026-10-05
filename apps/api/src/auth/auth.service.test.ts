import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UsuarioRequest } from '../common/usuario-actual.decorator';
import { preferenciasParcialSchema } from './auth.controller';
import { AuthService } from './auth.service';

/**
 * Contrato de `PATCH /auth/preferencias`: mezcla superficial entre lo guardado
 * y lo enviado (las claves ausentes no se pisan), con el mismo resultado
 * completo que devuelve el GET. El POST sigue guardando en bloque.
 */
const { upsertMock, updateMock } = vi.hoisted(() => ({
  upsertMock: vi.fn(),
  updateMock: vi.fn(),
}));

vi.mock('@mantirenfe/database', () => ({
  getPrisma: () => ({ usuario: { upsert: upsertMock, update: updateMock } }),
}));

const USUARIO: UsuarioRequest = { sub: 'u1', email: 'u1@example.com' };

/** Preferencias guardadas tal cual las leería el servicio (sin defaults). */
function guardarEnBd(preferencias: unknown) {
  upsertMock.mockResolvedValue({ id: USUARIO.sub, email: USUARIO.email, preferencias });
}

beforeEach(() => {
  upsertMock.mockReset();
  updateMock.mockReset();
  updateMock.mockResolvedValue({});
});

describe('AuthService.actualizarPreferenciasParciales', () => {
  it('cambia SOLO las claves enviadas y devuelve las preferencias completas', async () => {
    guardarEnBd({ notificacionesPush: false, minutosRecordatorio: 90, tema: 'claro' });

    const resultado = await new AuthService().actualizarPreferenciasParciales(USUARIO, {
      tema: 'oscuro',
    });

    // Lo no enviado queda intacto (este es el motivo del PATCH: el POST del
    // tema en la cabecera pisaba el resto de preferencias)
    expect(resultado).toEqual({
      notificacionesPush: false,
      notificacionesEmail: false,
      recordatorioSalida: true,
      resumenViaje: true,
      minutosRecordatorio: 90,
      tema: 'oscuro',
    });
    expect(updateMock).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { preferencias: resultado },
    });
  });

  it('rellena con los defaults lo que no estaba guardado', async () => {
    guardarEnBd(null);

    const resultado = await new AuthService().actualizarPreferenciasParciales(USUARIO, {
      notificacionesEmail: true,
    });

    expect(resultado).toEqual({
      notificacionesPush: true,
      notificacionesEmail: true,
      recordatorioSalida: true,
      resumenViaje: true,
      minutosRecordatorio: 50,
      tema: 'sistema',
    });
  });

  it('una clave enviada como undefined no borra el valor guardado', async () => {
    guardarEnBd({ tema: 'oscuro' });

    const resultado = await new AuthService().actualizarPreferenciasParciales(USUARIO, {
      tema: undefined,
    });

    expect(resultado.tema).toBe('oscuro');
  });

  it('garantiza que el usuario exista antes de escribir (asegurarUsuario)', async () => {
    guardarEnBd({});

    await new AuthService().actualizarPreferenciasParciales(USUARIO, { tema: 'claro' });

    expect(upsertMock).toHaveBeenCalledTimes(1);
  });
});

describe('preferenciasParcialSchema', () => {
  it('acepta un objeto parcial sin rellenar el resto de campos', () => {
    const parsed = preferenciasParcialSchema.safeParse({ tema: 'oscuro' });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    // Sin defaults: solo lo mandado, para que la mezcla no pise nada
    expect(parsed.data).toEqual({ tema: 'oscuro' });
  });

  it('acepta `{}` y no devuelve ningún campo', () => {
    const parsed = preferenciasParcialSchema.safeParse({});
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(Object.values(parsed.data).filter((v) => v !== undefined)).toEqual([]);
  });

  it('rechaza valores inválidos igual que el guardado completo', () => {
    expect(preferenciasParcialSchema.safeParse({ tema: 'neon' }).success).toBe(false);
    expect(preferenciasParcialSchema.safeParse({ minutosRecordatorio: 2 }).success).toBe(false);
    expect(preferenciasParcialSchema.safeParse({ notificacionesPush: 'si' }).success).toBe(false);
  });
});
