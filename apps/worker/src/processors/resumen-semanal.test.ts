import type { Logger } from 'pino';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  claveSemana,
  cuerpoResumenSemanal,
  desglosePorTipo,
  enviarResumenSemanal,
  metricasPorUsuario,
  pushHabilitado,
  semanaAnterior,
  TIPO_RESUMEN_SEMANAL,
  usuariosYaResumidos,
  type NotificacionSemana,
} from './resumen-semanal';

const store = vi.hoisted(() => ({
  notificaciones: [] as NotificacionSemana[],
  activas: [] as Array<{ usuarioId: string; total: number }>,
  usuarios: [] as Array<{
    id: string;
    preferencias: unknown;
    suscripciones: Array<{ endpoint: string; p256dh: string; auth: string }>;
    tokensMovil: Array<{ id: string; token: string }>;
  }>,
  creadas: [] as Array<{
    usuarioId: string;
    titulo: string;
    cuerpo: string;
    datos: Record<string, unknown>;
  }>,
}));

vi.mock('@mantirenfe/database', () => ({
  getPrisma: () => ({
    notificacion: {
      findMany: async () => store.notificaciones,
      create: async (args: { data: (typeof store.creadas)[number] }) => {
        store.creadas.push(args.data);
        return args.data;
      },
    },
    alerta: {
      groupBy: async () =>
        store.activas.map((a) => ({ usuarioId: a.usuarioId, _count: { _all: a.total } })),
    },
    usuario: { findMany: async () => store.usuarios },
  }),
}));

const logger = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
  debug: () => undefined,
} as unknown as Logger;

const noti = (usuarioId: string, creadaEn: string, datos: unknown = {}): NotificacionSemana => ({
  usuarioId,
  creadaEn: new Date(creadaEn),
  datos,
});

const usuario = (id: string, preferencias: unknown = {}) => ({
  id,
  preferencias,
  suscripciones: [],
  tokensMovil: [],
});

describe('semanaAnterior', () => {
  it('un lunes por la mañana devuelve la semana lun-dom que acaba de cerrar', () => {
    // lunes 28 sep 2026, 10:00 peninsular
    const rango = semanaAnterior(new Date('2026-09-28T08:00:00.000Z'));
    expect(rango.inicio.toISOString()).toBe('2026-09-21T00:00:00.000Z');
    expect(rango.fin.toISOString()).toBe('2026-09-28T00:00:00.000Z');
  });

  it('durante la semana apunta a la última semana completa', () => {
    const miercoles = semanaAnterior(new Date('2026-09-30T09:00:00.000Z'));
    expect(miercoles.inicio.toISOString()).toBe('2026-09-21T00:00:00.000Z');
    expect(miercoles.fin.toISOString()).toBe('2026-09-28T00:00:00.000Z');

    // domingo todavía dentro de la semana en curso: la cerrada es la anterior
    const domingo = semanaAnterior(new Date('2026-09-27T20:00:00.000Z'));
    expect(domingo.inicio.toISOString()).toBe('2026-09-14T00:00:00.000Z');
    expect(domingo.fin.toISOString()).toBe('2026-09-21T00:00:00.000Z');
  });

  it('funciona igual con el reloj de verano (UTC+2)', () => {
    const lunesVerano = semanaAnterior(new Date('2026-06-29T08:00:00.000Z')); // 10:00 peninsular
    expect(lunesVerano.inicio.toISOString()).toBe('2026-06-22T00:00:00.000Z');
    expect(lunesVerano.fin.toISOString()).toBe('2026-06-29T00:00:00.000Z');
  });

  it('la clave de dedupe es el lunes resumido', () => {
    expect(claveSemana(semanaAnterior(new Date('2026-09-28T08:00:00.000Z')))).toBe('2026-09-21');
  });
});

describe('metricasPorUsuario', () => {
  const rango = {
    inicio: new Date('2026-09-21T00:00:00.000Z'),
    fin: new Date('2026-09-28T00:00:00.000Z'),
  };

  it('cuenta avisos por usuario dentro de la semana y desglosa por tipo', () => {
    const metricas = metricasPorUsuario(
      [
        noti('u1', '2026-09-22T07:00:00Z', { tipo: 'cancelacion' }),
        noti('u1', '2026-09-23T07:00:00Z', { tipo: 'cancelacion' }),
        noti('u1', '2026-09-24T07:00:00Z', { tipo: 'incidencia' }),
        noti('u2', '2026-09-25T07:00:00Z', { tipo: 'recordatorio-salida' }),
      ],
      rango,
    );
    expect(metricas.get('u1')).toEqual({
      usuarioId: 'u1',
      avisos: 3,
      porTipo: { cancelacion: 2, incidencia: 1 },
    });
    expect(metricas.get('u2')?.avisos).toBe(1);
  });

  it('ignora lo anterior a la semana y el cierre (fin exclusivo)', () => {
    const metricas = metricasPorUsuario(
      [
        noti('u1', '2026-09-20T23:59:00Z', { tipo: 'incidencia' }),
        noti('u1', '2026-09-28T00:00:00Z', { tipo: 'incidencia' }),
        noti('u1', '2026-09-21T00:00:00Z', { tipo: 'incidencia' }),
      ],
      rango,
    );
    expect(metricas.get('u1')?.avisos).toBe(1);
  });

  it('cuenta los avisos sin tipo pero no los desglosa', () => {
    const metricas = metricasPorUsuario(
      [noti('u1', '2026-09-22T07:00:00Z'), noti('u1', '2026-09-23T07:00:00Z', { trenes: ['t1'] })],
      rango,
    );
    expect(metricas.get('u1')?.avisos).toBe(2);
    expect(metricas.get('u1')?.porTipo).toEqual({});
  });

  it('los resúmenes semanales no cuenten como avisos', () => {
    const metricas = metricasPorUsuario(
      [
        noti('u1', '2026-09-22T07:00:00Z', { tipo: 'incidencia' }),
        noti('u1', '2026-09-21T09:00:00Z', { tipo: 'resumen-semanal', semana: '2026-09-14' }),
      ],
      rango,
    );
    expect(metricas.get('u1')?.avisos).toBe(1);
    expect(metricas.get('u1')?.porTipo).toEqual({ incidencia: 1 });
  });
});

describe('usuariosYaResumidos (dedupe)', () => {
  const rango = {
    inicio: new Date('2026-09-21T00:00:00.000Z'),
    fin: new Date('2026-09-28T00:00:00.000Z'),
  };

  it('marca al usuario si ya existe su resumen de esta semana', () => {
    const resumidos = usuariosYaResumidos(
      [
        noti('u1', '2026-09-28T09:00:00Z', { tipo: 'resumen-semanal', semana: '2026-09-21' }),
        noti('u2', '2026-09-28T09:00:00Z', { tipo: 'resumen-semanal', semana: '2026-09-14' }),
        noti('u3', '2026-09-28T09:00:00Z', { tipo: 'incidencia' }),
      ],
      rango,
    );
    expect([...resumidos]).toEqual(['u1']);
  });

  it('sin marca de esta semana no dedupea', () => {
    expect(
      usuariosYaResumidos([noti('u1', '2026-09-28T09:00:00Z', { tipo: 'incidencia' })], rango).size,
    ).toBe(0);
  });
});

describe('cuerpoResumenSemanal', () => {
  const metrica = (avisos: number, porTipo: Record<string, number> = {}) => ({
    usuarioId: 'u1',
    avisos,
    porTipo,
  });

  it('resume avisos, alertas activas y desglose por tipo', () => {
    expect(cuerpoResumenSemanal(metrica(3, { cancelacion: 2, incidencia: 1 }), 3)).toBe(
      '3 avisos de 3 alertas activas (2 cancelaciones, 1 incidencia)',
    );
  });

  it('singular en avisos, alertas y tipos', () => {
    expect(cuerpoResumenSemanal(metrica(1, { cancelacion: 1 }), 1)).toBe(
      '1 aviso de 1 alerta activa (1 cancelación)',
    );
  });

  it('omite el desglose si no hay tipos conocidos', () => {
    expect(cuerpoResumenSemanal(metrica(5), 2)).toBe('5 avisos de 2 alertas activas');
    expect(desglosePorTipo({})).toBe('');
  });

  it('sin alertas activas no habla de "0 alertas activas"', () => {
    expect(cuerpoResumenSemanal(metrica(2, { incidencia: 1 }), 0)).toBe(
      '2 avisos esta semana (1 incidencia)',
    );
    expect(cuerpoResumenSemanal(metrica(0), 0)).toBe('0 avisos esta semana');
  });

  it('desglosa los tipos que ya se envían en sondeo/recordatorios/incidencias', () => {
    expect(
      desglosePorTipo({
        cancelacion: 2,
        incidencia: 1,
        'recordatorio-salida': 3,
        'resumen-viaje': 1,
        parada_suprimida: 1,
        precio: 2,
      }),
    ).toBe(
      '2 cancelaciones, 1 parada suprimida, 1 incidencia, 3 recordatorios de salida, 1 resumen de viaje, 2 avisos de precio',
    );
  });
});

describe('pushHabilitado', () => {
  it('activo por defecto salvo notificacionesPush en false', () => {
    expect(pushHabilitado(undefined)).toBe(true);
    expect(pushHabilitado('{}')).toBe(true);
    expect(pushHabilitado({ notificacionesPush: true })).toBe(true);
    expect(pushHabilitado({ notificacionesPush: false })).toBe(false);
    expect(pushHabilitado('{"notificacionesPush":false}')).toBe(false);
    expect(pushHabilitado('{no es json')).toBe(true);
  });
});

describe('enviarResumenSemanal', () => {
  // Lunes 28 sep 2026, 10:00 peninsular: semana resumida 21-27 sep
  const AHORA = new Date('2026-09-28T08:00:00.000Z');
  const SEMANA = '2026-09-21';

  beforeEach(() => {
    store.notificaciones = [];
    store.activas = [];
    store.usuarios = [];
    store.creadas = [];
  });

  it('envía a quien recibió avisos, con sus métricas, y deja la marca', async () => {
    store.notificaciones = [
      noti('u1', '2026-09-22T07:00:00Z', { tipo: 'cancelacion' }),
      noti('u1', '2026-09-23T07:00:00Z', { tipo: 'cancelacion' }),
      noti('u1', '2026-09-24T07:00:00Z', { tipo: 'incidencia' }),
      noti('u1', '2026-09-15T07:00:00Z', { tipo: 'incidencia' }), // fuera de la semana
      noti('u1', '2026-09-21T09:00:00Z', { tipo: 'resumen-semanal', semana: '2026-09-14' }),
      noti('u2', '2026-09-22T07:00:00Z', { tipo: 'recordatorio-salida' }), // push en false
      noti('u3', '2026-09-22T07:00:00Z'), // ya tiene su resumen de esta semana
      noti('u3', '2026-09-28T09:00:00Z', { tipo: 'resumen-semanal', semana: SEMANA }),
    ];
    store.activas = [
      { usuarioId: 'u1', total: 3 },
      { usuarioId: 'u2', total: 1 },
      { usuarioId: 'u3', total: 2 },
      { usuarioId: 'u4', total: 5 }, // activas pero sin avisos: no es candidato
    ];
    store.usuarios = [
      usuario('u1'),
      usuario('u2', { notificacionesPush: false }),
      usuario('u3'),
      usuario('u4'),
    ];

    const enviados = await enviarResumenSemanal(logger, AHORA);

    expect(enviados).toBe(1);
    expect(store.creadas).toHaveLength(1);
    expect(store.creadas[0]).toMatchObject({
      usuarioId: 'u1',
      titulo: 'Tu semana en MantiRenfe',
      cuerpo: '3 avisos de 3 alertas activas (2 cancelaciones, 1 incidencia)',
      datos: {
        tipo: TIPO_RESUMEN_SEMANAL,
        semana: SEMANA,
        avisos: 3,
        alertasActivas: 3,
        url: '/notificaciones',
        tag: `resumen-semanal-${SEMANA}`,
      },
    });
  });

  it('no reenvía si la marca de la semana ya existe', async () => {
    store.notificaciones = [
      noti('u1', '2026-09-22T07:00:00Z', { tipo: 'cancelacion' }),
      noti('u1', '2026-09-28T09:00:00Z', { tipo: 'resumen-semanal', semana: SEMANA }),
    ];
    store.activas = [{ usuarioId: 'u1', total: 1 }];
    store.usuarios = [usuario('u1')];

    expect(await enviarResumenSemanal(logger, AHORA)).toBe(0);
    expect(store.creadas).toHaveLength(0);
  });

  it('con push desactivado no envía nada, ni siquiera la fila', async () => {
    store.notificaciones = [noti('u2', '2026-09-22T07:00:00Z', { tipo: 'incidencia' })];
    store.activas = [{ usuarioId: 'u2', total: 1 }];
    store.usuarios = [usuario('u2', { notificacionesPush: false })];

    expect(await enviarResumenSemanal(logger, AHORA)).toBe(0);
    expect(store.creadas).toHaveLength(0);
  });

  it('sin avisos en la semana no envía nada aunque haya alertas activas', async () => {
    store.activas = [{ usuarioId: 'u4', total: 5 }];
    store.usuarios = [usuario('u4')];

    expect(await enviarResumenSemanal(logger, AHORA)).toBe(0);
    expect(store.creadas).toHaveLength(0);
  });

  it('agrupa varios usuarios y descarta a los que ya no están en BD', async () => {
    store.notificaciones = [
      noti('u1', '2026-09-22T07:00:00Z', { tipo: 'incidencia' }),
      noti('u2', '2026-09-23T07:00:00Z', { tipo: 'incidencia' }),
      noti('u5', '2026-09-24T07:00:00Z', { tipo: 'incidencia' }),
    ];
    store.activas = [
      { usuarioId: 'u1', total: 1 },
      { usuarioId: 'u2', total: 0 },
    ];
    store.usuarios = [usuario('u1'), usuario('u2')]; // u5 ya no existe

    const enviados = await enviarResumenSemanal(logger, AHORA);

    expect(enviados).toBe(2);
    expect(store.creadas.map((c) => c.usuarioId)).toEqual(['u1', 'u2']);
    expect(store.creadas[1]?.cuerpo).toBe('1 aviso esta semana (1 incidencia)');
  });
});
