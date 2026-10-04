import type { Logger } from 'pino';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { notificarIncidencias, type AlertaCandidata } from './incidencias';

/**
 * Mundo en memoria: `notificarIncidencias` cruza incidencias con alertas y
 * decide en BD qué par (incidencia, alerta) se avisa. Aquí se comprueba el
 * orden «marcar → avisar → desmarcar si falla», no el emparejamiento (ese lo
 * cubre `incidencias.test.ts`).
 */
const { prismaMock, estado } = vi.hoisted(() => {
  const estado = {
    incidencias: [] as Array<{
      id: string;
      titulo: string | null;
      mensaje: string | null;
      estacionesAfectadas: string[];
    }>,
    alertas: [] as Array<
      AlertaCandidata & {
        usuarioId: string;
        fechaViaje: Date;
        criterio: string;
        usuario: Record<string, unknown>;
      }
    >,
    /** updateMany disparados, en orden (marca y desmarca). */
    marcas: [] as Array<Record<string, unknown>>,
    /** Resultado simulado del updateMany de la marca. */
    marcaCount: 1,
    /** Si la notificación falla al guardarse. */
    crearFalla: false,
    creadas: 0,
  };
  const prismaMock = {
    incidencia: { findMany: async () => estado.incidencias },
    alerta: {
      findMany: async () => estado.alertas,
      updateMany: async (args: Record<string, unknown>) => {
        estado.marcas.push(args);
        return { count: estado.marcas.length === 1 ? estado.marcaCount : 1 };
      },
    },
    notificacion: {
      create: async () => {
        if (estado.crearFalla) throw new Error('BD caída');
        estado.creadas += 1;
        return {};
      },
    },
  };
  return { prismaMock, estado };
});

vi.mock('@mantirenfe/database', () => ({
  getPrisma: () => prismaMock,
  normalizarTexto: (texto: string) => texto,
}));

const logger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
} as unknown as Logger;

function alerta(id: string): (typeof estado.alertas)[number] {
  return {
    id,
    usuarioId: 'u1',
    origenNombre: 'Majadahonda',
    destinoNombre: 'Las Rozas',
    fechaViaje: new Date('2099-01-01T00:00:00.000Z'),
    criterio: 'DISPONIBILIDAD',
    incidenciasNotificadas: [],
    usuario: { preferencias: '{}', suscripciones: [], tokensMovil: [] },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  estado.incidencias = [
    { id: 'INC_1', titulo: 'Obra', mensaje: null, estacionesAfectadas: ['Majadahonda'] },
  ];
  estado.alertas = [alerta('a1')];
  estado.marcas = [];
  estado.marcaCount = 1;
  estado.crearFalla = false;
  estado.creadas = 0;
});

describe('notificarIncidencias (marca en BD antes de avisar)', () => {
  it('marca la incidencia en la alerta antes de crear la notificación', async () => {
    await notificarIncidencias(logger);

    expect(estado.marcas).toHaveLength(1);
    expect(estado.marcas[0]).toMatchObject({
      data: { incidenciasNotificadas: { set: ['INC_1'] } },
    });
    // El claim evita repetir el aviso si otra instancia ya lo ha marcado
    expect(estado.marcas[0]).toMatchObject({
      where: { NOT: { incidenciasNotificadas: { has: 'INC_1' } } },
    });
    expect(estado.creadas).toBe(1);
  });

  it('si la marca no cuenta (ya estaba), no vuelve a notificar', async () => {
    estado.marcaCount = 0;

    await notificarIncidencias(logger);

    expect(estado.marcas).toHaveLength(1);
    expect(estado.creadas).toBe(0);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('si la notificación falla, deshace la marca para no perder el aviso', async () => {
    estado.crearFalla = true;

    await notificarIncidencias(logger);

    // Primero la marca, después la desmarca con el array que había antes
    expect(estado.marcas).toHaveLength(2);
    expect(estado.marcas[1]).toMatchObject({
      where: { id: 'a1' },
      data: { incidenciasNotificadas: { set: [] } },
    });
    expect(logger.warn).toHaveBeenCalled();
  });
});
