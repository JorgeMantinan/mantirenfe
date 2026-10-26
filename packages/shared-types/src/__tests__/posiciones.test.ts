import { afterEach, describe, expect, it, vi } from 'vitest';
import { persistirPosicionesSnapshot, sqlUpsertPosiciones } from '../posiciones';
import type { BasePersistenciaPosiciones } from '../posiciones';
import type { PosicionTrenResponse } from '../dto/trenes';

function posicion(i: number): PosicionTrenResponse {
  return {
    id: `vehiculo-${i}`,
    numeroTren: `T-${1000 + i}`,
    latitud: 40.4 + i / 100,
    longitud: -3.7,
    velocidadKmh: 80,
    retrasoSeg: 120,
    actualizadaEn: new Date().toISOString(),
    tripId: `trip-${i}`,
  };
}

interface Doble extends BasePersistenciaPosiciones {
  crudas: Array<{ sql: string; params: unknown[] }>;
  /** Borrado del estado (el que iba contra los ids del snapshot). */
  borrados: unknown[];
  /** Poda de posiciones viejas (deleteMany por actualizadaEn). */
  poda: unknown[];
  creados: unknown[];
  puntos: unknown[];
  ultimoSnapshot: Date | null;
  ultimoPunto: Date | null;
}

/** Doble de cliente: sin `$executeRawUnsafe` reproduce el comportamiento viejo. */
function doble(): Doble {
  const estado: Doble = {
    crudas: [],
    borrados: [],
    poda: [],
    creados: [],
    puntos: [],
    ultimoSnapshot: null,
    ultimoPunto: null,
    posicionTren: {
      deleteMany: async (args) => {
        if (args.where.id) estado.borrados.push(args);
        else estado.poda.push(args);
        return { count: 0 };
      },
      createMany: async (args) => {
        estado.creados.push(args.data);
        return { count: args.data.length };
      },
      findFirst: async () =>
        estado.ultimoSnapshot ? { actualizadaEn: estado.ultimoSnapshot } : null,
    },
    posicionHistorial: {
      createMany: async (args) => {
        estado.puntos.push(args.data);
        return { count: args.data.length };
      },
      deleteMany: async () => ({ count: 0 }),
      findFirst: async () => (estado.ultimoPunto ? { en: estado.ultimoPunto } : null),
    },
    impuntualidadTren: {
      findMany: async () => [],
      createMany: async (args) => ({ count: args.data.length }),
      updateMany: async () => ({ count: 0 }),
    },
  };
  return estado;
}

/** Mismo doble pero con SQL cruta, como el PrismaClient real. */
function dobleConRaw(): Doble {
  const estado = doble();
  estado.$executeRawUnsafe = async (sql: string, ...params: unknown[]) => {
    estado.crudas.push({ sql, params });
    return params.length / 7;
  };
  return estado;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('sqlUpsertPosiciones', () => {
  it('genera un INSERT ... ON CONFLICT con un placeholder por columna', () => {
    const filas = [posicion(1), posicion(2)].map((p) => ({
      id: p.id,
      numeroTren: p.numeroTren,
      latitud: p.latitud,
      longitud: p.longitud,
      velocidadKmh: p.velocidadKmh,
      retrasoSeg: p.retrasoSeg,
      actualizadaEn: new Date('2026-01-01T00:00:00Z'),
    }));
    const { sql, params } = sqlUpsertPosiciones(filas);

    expect(sql).toContain('INSERT INTO "PosicionTren"');
    expect(sql).toContain('ON CONFLICT ("id") DO UPDATE SET');
    expect(sql).toContain('"actualizadaEn" = EXCLUDED."actualizadaEn"');
    expect(sql.match(/\$\d+/g)).toHaveLength(14);
    expect(params).toHaveLength(14);
    expect(params[0]).toBe('vehiculo-1');
    expect(params[7]).toBe('vehiculo-2');
  });
});

describe('persistirPosicionesSnapshot (escritura de estado)', () => {
  it('usa upsert en sitio cuando el cliente admite SQL cruta', async () => {
    vi.stubEnv('POSICIONES_PERSISTIR_SEG', '0');
    vi.stubEnv('POSICIONES_HISTORIAL_SEG', '0');
    const cliente = dobleConRaw();

    await persistirPosicionesSnapshot(cliente, [posicion(1), posicion(2), posicion(3)]);

    expect(cliente.crudas).toHaveLength(1);
    expect(cliente.crudas[0].sql).toContain('ON CONFLICT ("id") DO UPDATE SET');
    expect(cliente.crudas[0].params).toHaveLength(21);
    // Sin tuplas muertas: no hay deleteMany+createMany de la tabla completa
    // (la poda de posiciones viejas, que es otro deleteMany, sí sigue).
    expect(cliente.borrados).toEqual([]);
    expect(cliente.creados).toEqual([]);
  });

  it('trocea el upsert por lotes para no pasarse de parámetros', async () => {
    vi.stubEnv('POSICIONES_PERSISTIR_SEG', '0');
    vi.stubEnv('POSICIONES_HISTORIAL_SEG', '0');
    const cliente = dobleConRaw();
    const datos = Array.from({ length: 250 }, (_, i) => posicion(i));

    await persistirPosicionesSnapshot(cliente, datos);

    expect(cliente.crudas.map((lote) => lote.params.length / 7)).toEqual([100, 100, 50]);
  });

  it('sin SQL cruta (doble de test) cae al delete+insert histórico', async () => {
    vi.stubEnv('POSICIONES_PERSISTIR_SEG', '0');
    vi.stubEnv('POSICIONES_HISTORIAL_SEG', '0');
    const cliente = doble();

    await persistirPosicionesSnapshot(cliente, [posicion(1)]);

    expect(cliente.borrados).toHaveLength(1);
    expect(cliente.creados).toHaveLength(1);
  });
});

describe('persistirPosicionesSnapshot (throttles de escritura)', () => {
  it('no escribe nada si el último snapshot no ha cumplido POSICIONES_PERSISTIR_SEG', async () => {
    vi.stubEnv('POSICIONES_PERSISTIR_SEG', '1200');
    vi.stubEnv('POSICIONES_HISTORIAL_SEG', '1800');
    const cliente = dobleConRaw();
    cliente.ultimoSnapshot = new Date(Date.now() - 60_000);

    await persistirPosicionesSnapshot(cliente, [posicion(1)]);

    expect(cliente.crudas).toEqual([]);
    expect(cliente.borrados).toEqual([]);
    expect(cliente.poda).toEqual([]);
    expect(cliente.creados).toEqual([]);
    expect(cliente.puntos).toEqual([]);
  });

  it('escribe el historial solo cuando ha cumplido POSICIONES_HISTORIAL_SEG', async () => {
    vi.stubEnv('POSICIONES_PERSISTIR_SEG', '0');
    vi.stubEnv('POSICIONES_HISTORIAL_SEG', '1800');
    const reciente = dobleConRaw();
    reciente.ultimoPunto = new Date(Date.now() - 60_000);
    const antiguo = dobleConRaw();
    antiguo.ultimoPunto = new Date(Date.now() - 40 * 60_000);

    await persistirPosicionesSnapshot(reciente, [posicion(1)]);
    await persistirPosicionesSnapshot(antiguo, [posicion(1)]);

    expect(reciente.crudas).toHaveLength(1); // el estado sí se escribe
    expect(reciente.puntos).toEqual([]); // la traza no
    expect(antiguo.puntos).toHaveLength(1); // la traza sí
  });
});
