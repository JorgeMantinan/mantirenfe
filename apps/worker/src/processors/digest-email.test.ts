import type { Logger } from 'pino';
import type { EstadoSerializado } from '@mantirenfe/shared-types';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { enviarEmail } from '../notificaciones/email';
import {
  asuntoDigest,
  construirDigest,
  enviarDigestDiario,
  fechaDigest,
  lineaSalidaDigest,
  textoSalidaDigest,
  TIPO_DIGEST_EMAIL,
  type AlertaDigest,
} from './digest-email';

const store = vi.hoisted(() => ({
  alertas: [] as any[],
  marcas: [] as Array<{ usuarioId: string; creadaEn: Date; datos: unknown }>,
  creadas: [] as any[],
  consultasMarcas: 0,
}));

vi.mock('@mantirenfe/database', () => ({
  getPrisma: () => ({
    alerta: {
      // Aplica el where de verdad (estado + fechaViaje/recurrente): el criterio
      // "recurrente o fecha de viaje = hoy" es de SQL, no de memoria
      findMany: async (args?: any) => {
        const donde = args?.where;
        return store.alertas.filter((a) => {
          if (donde?.estado && a.estado !== donde.estado) return false;
          const ramas: any[] = donde?.OR ?? [];
          if (ramas.length === 0) return true;
          return ramas.some((rama) => {
            if ('recurrente' in rama) return a.recurrente === true;
            if ('fechaViaje' in rama)
              return a.fechaViaje?.getTime?.() === rama.fechaViaje.getTime();
            return false;
          });
        });
      },
    },
    notificacion: {
      findMany: async () => {
        store.consultasMarcas += 1;
        return store.marcas;
      },
      create: async (args: { data: any }) => {
        store.creadas.push(args.data);
        return args.data;
      },
    },
  }),
}));

vi.mock('../notificaciones/email', () => ({ enviarEmail: vi.fn(async () => undefined) }));

const logger = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
  debug: () => undefined,
} as unknown as Logger;

// Lunes 28 sep 2026, 07:30 peninsular
const AHORA = new Date('2026-09-28T05:30:00.000Z');
const HOY = '2026-09-28';

const tren = (overrides: Partial<EstadoSerializado> = {}): EstadoSerializado => ({
  trenId: 't1',
  numeroTren: '04314',
  salida: '2026-09-28T07:35:00.000Z',
  disponible: true,
  precioMin: 32.5,
  cancelado: false,
  ...overrides,
});

const alerta = (overrides: Partial<AlertaDigest> = {}): AlertaDigest => ({
  id: 'a1',
  origenNombre: 'A Coruña',
  destinoNombre: 'Madrid',
  recurrente: true,
  soloLaborables: false,
  horaDesde: null,
  horaHasta: null,
  ultimoEstado: null,
  ...overrides,
});

const alertaBd = (overrides: Record<string, unknown> = {}) => ({
  id: 'a1',
  usuarioId: 'u1',
  origenNombre: 'A Coruña',
  destinoNombre: 'Madrid',
  recurrente: true,
  soloLaborables: false,
  horaDesde: null,
  horaHasta: null,
  ultimoEstado: null,
  estado: 'ACTIVA',
  fechaViaje: new Date(`${HOY}T00:00:00.000Z`),
  usuario: { email: 'u1@test.es', preferencias: { notificacionesEmail: true } },
  ...overrides,
});

describe('fechaDigest', () => {
  it('escribe la fecha peninsular en español sin la coma de Intl', () => {
    expect(fechaDigest(AHORA)).toBe('lunes 28 de septiembre');
    expect(fechaDigest(new Date('2026-09-27T20:00:00.000Z'))).toBe('domingo 27 de septiembre');
  });
});

describe('textoSalidaDigest', () => {
  it('cita el precio cuando hay plazas', () => {
    expect(textoSalidaDigest(tren())).toBe('Hay plazas desde 32,50 €');
    expect(textoSalidaDigest(tren({ precioMin: null }))).toBe('Hay plazas');
  });

  it('sin disponibilidad confirmada avisa de falta de datos', () => {
    expect(textoSalidaDigest(tren({ disponible: false, precioMin: null }))).toBe(
      'Sin datos de plazas aún',
    );
  });

  it('la cancelación manda sobre el resto', () => {
    expect(textoSalidaDigest(tren({ cancelado: true, disponible: true }))).toBe('⚠ Cancelado');
  });
});

describe('lineaSalidaDigest', () => {
  it('incluye hora, trayecto, tren y estado', () => {
    expect(lineaSalidaDigest(alerta(), tren())).toBe(
      '· 07:35 A Coruña → Madrid (tren 04314) — Hay plazas desde 32,50 €',
    );
  });

  it('omite el tren si no tiene número', () => {
    expect(lineaSalidaDigest(alerta(), tren({ numeroTren: '' }))).toBe(
      '· 07:35 A Coruña → Madrid — Hay plazas desde 32,50 €',
    );
  });
});

describe('construirDigest', () => {
  it('cuerpo con las salidas ordenadas por hora', () => {
    const digest = construirDigest(
      [
        alerta({
          id: 'a2',
          ultimoEstado: [
            tren({
              trenId: 't2',
              salida: '2026-09-28T19:00:00.000Z',
              numeroTren: '',
              disponible: false,
              precioMin: null,
            }),
          ],
        }),
        alerta({ id: 'a1', ultimoEstado: [tren()] }),
      ],
      AHORA,
    );

    expect(digest?.cuerpo).toBe(
      [
        'Tu día de viaje — lunes 28 de septiembre',
        '· 07:35 A Coruña → Madrid (tren 04314) — Hay plazas desde 32,50 €',
        '· 19:00 A Coruña → Madrid — Sin datos de plazas aún',
      ].join('\n'),
    );
    expect(digest?.salidas).toBe(2);
  });

  it('respeta la franja horaria y avisa de las alertas sin salidas', () => {
    const digest = construirDigest(
      [
        alerta({ horaDesde: '08:00', ultimoEstado: [tren()] }),
        alerta({ id: 'a2', horaDesde: '08:00', ultimoEstado: [tren({ trenId: 't2' })] }),
      ],
      AHORA,
    );

    expect(digest?.cuerpo).toBe(
      [
        'Tu día de viaje — lunes 28 de septiembre',
        'Sin salidas hoy: 2 alertas en pausa de datos...',
      ].join('\n'),
    );
    expect(digest?.salidas).toBe(0);
  });

  it('plural y singular en el remate de alertas sin salidas', () => {
    expect(
      construirDigest([alerta({ horaHasta: '06:00', ultimoEstado: [tren()] })], AHORA)?.cuerpo,
    ).toContain('Sin salidas hoy: 1 alerta en pausa de datos...');
  });

  it('una alerta sin ultimoEstado se muestra como sondeando', () => {
    const digest = construirDigest(
      [alerta({ ultimoEstado: null }), alerta({ id: 'a2', ultimoEstado: undefined })],
      AHORA,
    );

    expect(digest?.cuerpo).toBe(
      [
        'Tu día de viaje — lunes 28 de septiembre',
        '· A Coruña → Madrid — sondeando...',
        '· A Coruña → Madrid — sondeando...',
      ].join('\n'),
    );
  });

  it('limita el cuerpo a 10 salidas', () => {
    const muchas = Array.from({ length: 15 }, (_, i) =>
      tren({
        trenId: `t${i}`,
        numeroTren: String(4000 + i),
        salida: `2026-09-28T${String(6 + i).padStart(2, '0')}:10:00.000Z`,
      }),
    );
    const digest = construirDigest([alerta({ ultimoEstado: muchas })], AHORA);

    expect(digest?.salidas).toBe(10);
    expect(digest?.cuerpo.split('\n')).toHaveLength(11); // cabecera + 10
    expect(digest?.cuerpo).toContain('· 15:10');
    expect(digest?.cuerpo).not.toContain('· 16:10');
  });

  it('sin alertas no hay digest que construir', () => {
    expect(construirDigest([], AHORA)).toBeNull();
  });
});

describe('asuntoDigest', () => {
  it('cuenta las salidas incluidas y avisa si no hay ninguna', () => {
    expect(asuntoDigest(3)).toBe('MantiRenfe · Tu día de viaje — 3 salidas hoy');
    expect(asuntoDigest(1)).toBe('MantiRenfe · Tu día de viaje — 1 salida hoy');
    expect(asuntoDigest(0)).toBe('MantiRenfe · Tu día de viaje — sin salidas hoy');
  });
});

describe('enviarDigestDiario', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    store.alertas = [];
    store.marcas = [];
    store.creadas = [];
    store.consultasMarcas = 0;
  });

  it('un email por usuario con sus salidas y la marca de dedupe', async () => {
    store.alertas = [
      alertaBd({ id: 'a1', ultimoEstado: [tren()] }),
      alertaBd({
        id: 'a2',
        ultimoEstado: [tren({ trenId: 't2', salida: '2026-09-28T19:00:00.000Z', numeroTren: '' })],
      }),
      alertaBd({
        id: 'a3',
        usuarioId: 'u2',
        usuario: { email: 'u2@test.es', preferencias: { notificacionesEmail: true } },
        ultimoEstado: [tren()],
      }),
      alertaBd({
        id: 'a4',
        usuarioId: 'u3',
        usuario: { email: 'u3@test.es', preferencias: { notificacionesEmail: false } },
        ultimoEstado: [tren()],
      }),
    ];

    const enviados = await enviarDigestDiario(logger, AHORA);

    expect(enviados).toBe(2);
    expect(enviarEmail).toHaveBeenCalledTimes(2);
    expect(enviarEmail).toHaveBeenNthCalledWith(
      1,
      'u1@test.es',
      'MantiRenfe · Tu día de viaje — 2 salidas hoy',
      expect.stringContaining('· 07:35 A Coruña → Madrid (tren 04314) — Hay plazas desde 32,50 €'),
      logger,
    );
    expect(enviarEmail).toHaveBeenNthCalledWith(
      2,
      'u2@test.es',
      expect.any(String),
      expect.any(String),
      logger,
    );

    expect(store.creadas).toHaveLength(2);
    expect(store.creadas[0]).toMatchObject({
      usuarioId: 'u1',
      titulo: 'MantiRenfe · Tu día de viaje — 2 salidas hoy',
      datos: { tipo: TIPO_DIGEST_EMAIL, dia: HOY, salidas: 2, alertas: 2 },
    });
  });

  it('no reenvía si ya hay marca de digest para hoy', async () => {
    store.alertas = [alertaBd({ ultimoEstado: [tren()] })];
    store.marcas = [
      {
        usuarioId: 'u1',
        creadaEn: new Date(AHORA.getTime() - 60_000),
        datos: { tipo: TIPO_DIGEST_EMAIL, dia: HOY },
      },
    ];

    expect(await enviarDigestDiario(logger, AHORA)).toBe(0);
    expect(enviarEmail).not.toHaveBeenCalled();
    expect(store.creadas).toHaveLength(0);
  });

  it('una marca de otro día no dedupea el de hoy', async () => {
    store.alertas = [alertaBd({ ultimoEstado: [tren()] })];
    store.marcas = [
      {
        usuarioId: 'u1',
        creadaEn: new Date(AHORA.getTime() - 25 * 60 * 60 * 1000),
        datos: { tipo: TIPO_DIGEST_EMAIL, dia: '2026-09-27' },
      },
      {
        usuarioId: 'u1',
        creadaEn: new Date(AHORA.getTime() - 60_000),
        datos: { tipo: 'incidencia' },
      },
    ];

    expect(await enviarDigestDiario(logger, AHORA)).toBe(1);
    expect(enviarEmail).toHaveBeenCalledTimes(1);
  });

  it('sin notificacionesEmail no se consulta ni se envía', async () => {
    store.alertas = [
      alertaBd({ usuario: { email: 'u1@test.es', preferencias: {} } }),
      alertaBd({ id: 'a2', usuario: { email: 'u1@test.es', preferencias: '{}' } }),
      alertaBd({
        id: 'a3',
        usuario: { email: 'u1@test.es', preferencias: { notificacionesEmail: false } },
      }),
    ];

    expect(await enviarDigestDiario(logger, AHORA)).toBe(0);
    expect(enviarEmail).not.toHaveBeenCalled();
    expect(store.consultasMarcas).toBe(0);
    expect(store.creadas).toHaveLength(0);
  });

  it('sin alertas aplicables no se envía nada', async () => {
    expect(await enviarDigestDiario(logger, AHORA)).toBe(0);
    expect(enviarEmail).not.toHaveBeenCalled();
    expect(store.consultasMarcas).toBe(0);
  });

  it('sin alertas hoy no hay email (las de otro día no son candidatas)', async () => {
    store.alertas = [
      alertaBd({ recurrente: false, fechaViaje: new Date('2026-09-30T00:00:00.000Z') }),
    ];

    expect(await enviarDigestDiario(logger, AHORA)).toBe(0);
    expect(enviarEmail).not.toHaveBeenCalled();
  });

  it('una alerta solo laborables no se cuenta en domingo', async () => {
    const domingo = new Date('2026-09-27T05:30:00.000Z');
    store.alertas = [
      alertaBd({
        soloLaborables: true,
        fechaViaje: new Date('2026-09-27T00:00:00.000Z'),
        ultimoEstado: [tren({ salida: '2026-09-27T07:35:00.000Z' })],
      }),
    ];

    expect(await enviarDigestDiario(logger, domingo)).toBe(0);
    expect(enviarEmail).not.toHaveBeenCalled();
  });

  it('con alertas pero sin salidas se avisa en el asunto y en el cuerpo', async () => {
    store.alertas = [alertaBd({ ultimoEstado: [] })];

    expect(await enviarDigestDiario(logger, AHORA)).toBe(1);
    expect(enviarEmail).toHaveBeenCalledWith(
      'u1@test.es',
      'MantiRenfe · Tu día de viaje — sin salidas hoy',
      expect.stringContaining('Sin salidas hoy: 1 alerta en pausa de datos...'),
      logger,
    );
    expect(store.creadas[0]?.datos).toMatchObject({
      tipo: TIPO_DIGEST_EMAIL,
      dia: HOY,
      salidas: 0,
    });
  });
});
