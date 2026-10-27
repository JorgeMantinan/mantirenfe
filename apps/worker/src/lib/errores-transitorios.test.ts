import { describe, expect, it } from 'vitest';
import { esIndisponibilidadDeBaseDeDatos } from './errores-transitorios';

/** Réplica del PrismaClientInitializationError que repite Supabase de madrugada. */
const sinConexion = {
  code: 'P1001',
  message:
    "\nInvalid `prisma.alerta.updateMany()` invocation:\n\n\nCan't reach database server at `aws-1-eu-west-1.pooler.supabase.com:5432`",
};

/** PrismaClientUnknownRequestError: la consulta llegó pero la BD la canceló. */
const consultaCancelada = {
  code: 'P2010',
  meta: {
    code: '57014',
    message: 'canceling statement due to statement timeout',
  },
  message: 'Invalid `prisma.horarioTren.findMany()` invocation',
};

describe('esIndisponibilidadDeBaseDeDatos', () => {
  it('reconoce que no se llega al pooler', () => {
    expect(esIndisponibilidadDeBaseDeDatos(sinConexion)).toBe(true);
    expect(esIndisponibilidadDeBaseDeDatos(new Error("Can't reach database server"))).toBe(true);
  });

  it('reconoce una consulta cancelada por timeout o por saturación', () => {
    expect(esIndisponibilidadDeBaseDeDatos(consultaCancelada)).toBe(true);
    expect(
      esIndisponibilidadDeBaseDeDatos({
        code: 'P2010',
        meta: { code: '53300', message: 'too many connections' },
      }),
    ).toBe(true);
    expect(
      esIndisponibilidadDeBaseDeDatos({
        code: 'P2024',
        message: 'Timed out fetching a new connection',
      }),
    ).toBe(true);
  });

  it('NO confunde un error de SQL con una caída de la BD', () => {
    // Syntax error / tabla inexistente: eso hay que arreglarlo, no taparlo.
    expect(
      esIndisponibilidadDeBaseDeDatos({
        code: 'P2010',
        meta: { code: '42601', message: 'syntax error at or near "SELCT"' },
      }),
    ).toBe(false);
    expect(
      esIndisponibilidadDeBaseDeDatos({
        code: 'P2021',
        message: 'The table `public.HorarioTren` does not exist',
      }),
    ).toBe(false);
    expect(esIndisponibilidadDeBaseDeDatos({ code: 'P2002', message: 'Unique constraint' })).toBe(
      false,
    );
  });

  it('ignora errores que no son de base de datos', () => {
    expect(esIndisponibilidadDeBaseDeDatos(new Error('boom'))).toBe(false);
    expect(esIndisponibilidadDeBaseDeDatos('boom')).toBe(false);
    expect(esIndisponibilidadDeBaseDeDatos(null)).toBe(false);
    expect(esIndisponibilidadDeBaseDeDatos(undefined)).toBe(false);
  });
});
