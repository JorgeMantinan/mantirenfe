import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import AdmZip from 'adm-zip';
import type { Logger } from 'pino';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cabecerasGtfs,
  fuentesGtfs,
  repararTripIdsDesactualizados,
  sincronizarEstaciones,
  sincronizarHorarios,
  type BaseReparacionTripIds,
} from './sync-gtfs';

interface EstacionGuardada {
  id: string;
  codigo: string;
  nombre: string;
  latitud: number | null;
  longitud: number | null;
}

interface ParadaGuardada {
  tripId: string;
  orden: number;
  estacionId: string;
  llegadaMin: number | null;
  salidaMin: number | null;
}

interface HorarioGuardado {
  id: string;
  numeroTren: string;
  fecha: Date;
  salida: Date;
  operador: string | null;
  tripId?: string | null;
  origenEstacionId: string;
  destinoEstacionId: string;
}

/** Clave única de HorarioTren: [numeroTren, fecha, origenEstacionId, salida]. */
function claveHorario(f: {
  numeroTren: string;
  fecha: Date;
  origenEstacionId: string;
  salida: Date;
}): string {
  return `${f.numeroTren}|${f.fecha.toISOString()}|${f.origenEstacionId}|${f.salida.toISOString()}`;
}

const { prismaMock, store } = vi.hoisted(() => {
  const store = {
    estaciones: new Map<string, EstacionGuardada>(),
    horarios: [] as HorarioGuardado[],
    paradas: [] as ParadaGuardada[],
    estacionesUpsert: [] as string[],
    estacionesCreateMany: [] as string[],
    /** Llamadas a findMany del mecanismo de reparación de tripIds. */
    consultasReparacion: [] as number[],
    /** Updates aplicados por `repararTripIdsDesactualizados`. */
    reparaciones: [] as Array<{ id: string; tripId: string }>,
  };

  const prismaMock = {
    estacion: {
      upsert: async (args: {
        where: { codigo: string };
        update: Partial<EstacionGuardada>;
        create: EstacionGuardada;
      }) => {
        const existente = store.estaciones.get(args.where.codigo);
        if (existente) {
          Object.assign(existente, args.update);
        } else {
          store.estaciones.set(args.where.codigo, args.create);
        }
        store.estacionesUpsert.push(args.where.codigo);
        return existente ?? args.create;
      },
      createMany: async (args: { data: EstacionGuardada[] }) => {
        let count = 0;
        for (const fila of args.data) {
          store.estacionesCreateMany.push(fila.codigo);
          if (store.estaciones.has(fila.codigo)) continue;
          store.estaciones.set(fila.codigo, fila);
          count++;
        }
        return { count };
      },
      findMany: async () => [...store.estaciones.values()],
    },
    horarioTren: {
      // Emula `skipDuplicates` sobre la unique [numeroTren, fecha, origen, salida]
      createMany: async (args: {
        data: Array<{
          numeroTren: string;
          fecha: Date;
          salida: Date;
          operador: string | null;
          tripId: string;
          origenEstacionId: string;
          destinoEstacionId: string;
        }>;
      }) => {
        let count = 0;
        for (const fila of args.data) {
          const clave = claveHorario(fila);
          if (store.horarios.some((h) => claveHorario(h) === clave)) continue;
          store.horarios.push({ ...fila, id: `h${store.horarios.length + 1}` });
          count++;
        }
        return { count };
      },
      findMany: async (args: {
        where: {
          AND: [
            {
              OR: Array<{
                AND: {
                  numeroTren: string;
                  fecha: Date;
                  origenEstacionId: string;
                  salida: Date;
                };
              }>;
            },
            { OR: Array<{ tripId: null } | { tripId: { notIn: string[] } }> },
          ];
        };
      }) => {
        store.consultasReparacion.push(args.where.AND[0].OR.length);
        const [porClave, porTripId] = args.where.AND;
        const claves = new Set(porClave.OR.map((r) => claveHorario(r.AND)));
        const admiteNull = porTripId.OR.some((r) => r.tripId === null);
        const fuera = porTripId.OR.flatMap((r) => (r.tripId === null ? [] : r.tripId.notIn));
        return store.horarios
          .filter(
            (h) =>
              claves.has(claveHorario(h)) &&
              (h.tripId == null ? admiteNull : !fuera.includes(h.tripId)),
          )
          .map((h) => ({
            id: h.id,
            numeroTren: h.numeroTren,
            fecha: h.fecha,
            origenEstacionId: h.origenEstacionId,
            salida: h.salida,
            tripId: h.tripId ?? null,
          }));
      },
      update: async (args: { where: { id: string }; data: { tripId: string } }) => {
        const fila = store.horarios.find((h) => h.id === args.where.id);
        if (!fila) throw new Error(`sin fila ${args.where.id}`);
        fila.tripId = args.data.tripId;
        store.reparaciones.push({ id: args.where.id, tripId: args.data.tripId });
        return fila;
      },
      count: async () => 0,
      deleteMany: async () => ({ count: 0 }),
    },
    paradaHorario: {
      createMany: async (args: { data: ParadaGuardada[] }) => {
        let count = 0;
        for (const fila of args.data) {
          const clave = `${fila.tripId}|${fila.orden}`;
          if (store.paradas.some((p) => `${p.tripId}|${p.orden}` === clave)) continue;
          store.paradas.push(fila);
          count++;
        }
        return { count };
      },
      findMany: async (args?: { distinct?: string[] }) => {
        if (!args?.distinct?.includes('tripId')) return store.paradas;
        const vistos = new Set<string>();
        const distintos: Array<{ tripId: string }> = [];
        for (const parada of store.paradas) {
          if (vistos.has(parada.tripId)) continue;
          vistos.add(parada.tripId);
          distintos.push({ tripId: parada.tripId });
        }
        return distintos;
      },
      deleteMany: async (args: { where: { tripId: { in: string[] } } }) => {
        const antes = store.paradas.length;
        store.paradas = store.paradas.filter((p) => !args.where.tripId.in.includes(p.tripId));
        return { count: antes - store.paradas.length };
      },
    },
  };

  return { prismaMock, store };
});

vi.mock('@mantirenfe/database', () => ({ getPrisma: () => prismaMock }));

const logger = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
  debug: () => undefined,
} as unknown as Logger;

const ENVS = ['GTFS_ZIP_URLS', 'GTFS_ZIP_URLS_OUIGO', 'NAP_API_KEY'] as const;
const envOriginal: Record<string, string | undefined> = {};

const CALENDAR =
  'service_id,start_date,end_date,monday,tuesday,wednesday,thursday,friday,saturday,sunday\n' +
  'S1,20200101,20991231,1,1,1,1,1,1,1\n';

function zipGtfs(archivos: Record<string, string>): Buffer {
  const zip = new AdmZip();
  for (const [nombre, contenido] of Object.entries(archivos)) {
    zip.addFile(nombre, Buffer.from(contenido, 'utf8'));
  }
  return zip.toBuffer();
}

// Feed "Renfe": route_long_name vacío → el operador sale de route_short_name.
const ZIP_PRINCIPAL = zipGtfs({
  'agency.txt':
    'agency_id,agency_name,agency_url,agency_timezone\n1,Renfe,https://renfe.com,Europe/Madrid\n',
  'stops.txt':
    'stop_id,stop_name,stop_lat,stop_lon\n' +
    '17000,Madrid-Chamartín-Clara Campoamor,40.47,-3.68\n' +
    '28000,Barcelona-Sants,41.38,2.14\n',
  'routes.txt': 'route_id,agency_id,route_short_name,route_long_name,route_type\nR1,1,AVE,,2\n',
  'calendar.txt': CALENDAR,
  'trips.txt': 'route_id,service_id,trip_id,trip_short_name\nR1,S1,T1,01234\n',
  'stop_times.txt':
    'trip_id,arrival_time,departure_time,stop_id,stop_sequence\n' +
    'T1,08:00:00,08:00:00,17000,1\n' +
    'T1,10:30:00,10:30:00,28000,2\n',
});

// Feed "OUIGO": route_long_name es la ruta, no el operador → se fuerza OUIGO.
const ZIP_OUIGO = zipGtfs({
  'agency.txt':
    'agency_id,agency_name,agency_url,agency_timezone\n1,OUIGO Espana,https://www.ouigo.com,Europe/Madrid\n',
  'stops.txt':
    'stop_id,stop_name,stop_lat,stop_lon\n' +
    '17000,MADRID CHAMARTIN,40.47,-3.68\n' +
    '66000,LYON PART DIEU,45.76,4.86\n',
  'routes.txt':
    'route_id,agency_id,route_short_name,route_long_name,route_type\n' +
    'R9,1,TGV,MADRID-CHAMARTIN -- LYON PART-DIEU,2\n',
  'calendar.txt': CALENDAR,
  'trips.txt': 'route_id,service_id,trip_id,trip_short_name\nR9,S1,OT1,09876\n',
  'stop_times.txt':
    'trip_id,arrival_time,departure_time,stop_id,stop_sequence\n' +
    'OT1,07:00:00,07:00:00,17000,1\n' +
    'OT1,11:00:00,11:00:00,66000,2\n',
});

let servidor: Server;
let base = '';
const peticiones: Array<{ url?: string; apikey?: string }> = [];

beforeAll(async () => {
  servidor = createServer((req, res) => {
    peticiones.push({ url: req.url, apikey: req.headers.apikey as string | undefined });
    res.writeHead(200, { 'content-type': 'application/zip' });
    res.end(req.url?.includes('ouigo') ? ZIP_OUIGO : ZIP_PRINCIPAL);
  });
  await new Promise<void>((resolve) => servidor.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => servidor.close(() => resolve()));
});

beforeEach(() => {
  for (const clave of ENVS) envOriginal[clave] = process.env[clave];
  store.estaciones.clear();
  store.horarios.length = 0;
  store.paradas.length = 0;
  store.estacionesUpsert.length = 0;
  store.estacionesCreateMany.length = 0;
  store.consultasReparacion.length = 0;
  store.reparaciones.length = 0;
  peticiones.length = 0;
});

afterEach(() => {
  for (const clave of ENVS) {
    if (envOriginal[clave] === undefined) delete process.env[clave];
    else process.env[clave] = envOriginal[clave];
  }
});

describe('fuentesGtfs', () => {
  it('usa los feeds por defecto de Renfe cuando no hay nada configurado', () => {
    delete process.env.GTFS_ZIP_URLS;
    delete process.env.GTFS_ZIP_URLS_OUIGO;
    expect(fuentesGtfs()).toEqual([
      { url: 'https://ssl.renfe.com/gtransit/Fichero_AV_LD/google_transit.zip' },
      { url: 'https://ssl.renfe.com/ftransit/Fichero_CER_FOMENTO/fomento_transit.zip' },
    ]);
  });

  it('GTFS_ZIP_URLS_OUIGO añade un feed secundario con operador OUIGO', () => {
    process.env.GTFS_ZIP_URLS = ' https://ejemplo.es/renfe.zip , ';
    process.env.GTFS_ZIP_URLS_OUIGO = 'https://nap.transportes.gob.es/api/Fichero/download/1766';
    expect(fuentesGtfs()).toEqual([
      { url: 'https://ejemplo.es/renfe.zip' },
      { url: 'https://nap.transportes.gob.es/api/Fichero/download/1766', operador: 'OUIGO' },
    ]);
  });

  it('sin GTFS_ZIP_URLS_OUIGO no hay ningún feed multioperador', () => {
    delete process.env.GTFS_ZIP_URLS_OUIGO;
    expect(fuentesGtfs().some((f) => f.operador)).toBe(false);
  });
});

describe('cabecerasGtfs', () => {
  it('sin NAP_API_KEY no envía nada', () => {
    delete process.env.NAP_API_KEY;
    expect(
      cabecerasGtfs('https://nap.transportes.gob.es/api/Fichero/download/1766'),
    ).toBeUndefined();
  });

  it('con clave solo la manda al NAP del Ministerio', () => {
    process.env.NAP_API_KEY = 'clave-de-prueba';
    expect(cabecerasGtfs('https://nap.transportes.gob.es/api/Fichero/download/1766')).toEqual({
      ApiKey: 'clave-de-prueba',
    });
    expect(cabecerasGtfs('https://ssl.renfe.com/gtransit/Fichero_AV_LD/google_transit.zip')).toBe(
      undefined,
    );
    expect(cabecerasGtfs('https://otro-servidor.es/feed.zip')).toBeUndefined();
  });
});

describe('sincronizarEstaciones + sincronizarHorarios (multioperador)', () => {
  it('importa OUIGO como operador propio sin pisar las estaciones existentes', async () => {
    process.env.GTFS_ZIP_URLS = `${base}/renfe.zip`;
    process.env.GTFS_ZIP_URLS_OUIGO = `${base}/ouigo.zip`;
    process.env.NAP_API_KEY = 'clave-de-prueba';

    await sincronizarEstaciones(logger);
    await sincronizarHorarios(logger);

    // El feed principal crea la estación con su nombre...
    expect(store.estaciones.get('17000')?.nombre).toBe('Madrid-Chamartín-Clara Campoamor');
    expect(store.estacionesUpsert).toEqual(['17000', '28000']);
    // ...y el feed OUIGO pasa por createMany sin actualizar lo que ya existe,
    // aunque el mismo código venga con otra denominación
    expect(store.estacionesCreateMany).toEqual(['17000', '66000']);
    expect(store.estaciones.get('17000')?.nombre).not.toBe('MADRID CHAMARTIN');
    // Las estaciones que solo existen en OUIGO sí se dan de alta
    expect(store.estaciones.get('66000')?.nombre).toBe('LYON PART DIEU');

    const porTren = new Map(store.horarios.map((h) => [h.numeroTren, h]));
    expect(porTren.get('01234')?.operador).toBe('AVE');
    expect(porTren.get('01234')?.tripId).toBe('T1');
    const ouigo = porTren.get('09876');
    expect(ouigo?.operador).toBe('OUIGO');
    expect(ouigo?.tripId).toBe('OT1');
    expect(ouigo?.origenEstacionId).toBe('17000');
    expect(ouigo?.destinoEstacionId).toBe('66000');

    // ParadaHorario guarda TODAS las paradas del trip (no solo los extremos),
    // una fila por (trip, stop_sequence) y sin fecha
    expect(store.paradas.map((p) => `${p.tripId}:${p.orden}:${p.estacionId}`)).toEqual([
      'T1:1:17000',
      'T1:2:28000',
      'OT1:1:17000',
      'OT1:2:66000',
    ]);
    expect(store.paradas[0]).toMatchObject({ salidaMin: 480, llegadaMin: 480 });
    expect(store.paradas[3]).toMatchObject({ salidaMin: 660, llegadaMin: 660 });

    // La ApiKey del NAP no se filtra a otros hosts (2 feeds × 2 pasadas)
    expect(peticiones).toHaveLength(4);
    for (const peticion of peticiones) expect(peticion.apikey).toBeUndefined();
  });

  it('repara el tripId de otra publicación que choca en la unique', async () => {
    process.env.GTFS_ZIP_URLS = `${base}/renfe.zip`;
    process.env.GTFS_ZIP_URLS_OUIGO = '';

    await sincronizarEstaciones(logger);

    // Fila heredada de una publicación anterior: MISMA unique que la del feed
    // ([numeroTren, fecha, origen, salida]) pero con un tripId que el feed ya
    // no publica → createMany la salta y, sin reparación, no cruzaría nunca.
    const hoy = new Date();
    hoy.setUTCHours(0, 0, 0, 0);
    store.horarios.push({
      id: 'h-legacy',
      numeroTren: '01234',
      fecha: new Date(hoy),
      salida: new Date(hoy.getTime() + 8 * 60 * 60_000),
      operador: 'AVE',
      tripId: 'T1-DE-OTRA-PUBLICACION',
      origenEstacionId: '17000',
      destinoEstacionId: '28000',
    });

    await sincronizarHorarios(logger);

    expect(store.reparaciones).toEqual([{ id: 'h-legacy', tripId: 'T1' }]);
    expect(store.horarios.find((h) => h.id === 'h-legacy')?.tripId).toBe('T1');
    expect(store.consultasReparacion.length).toBeGreaterThan(0);
  });
});

describe('repararTripIdsDesactualizados', () => {
  const FECHA = new Date(Date.UTC(2026, 8, 29));
  const SALIDA = new Date(Date.UTC(2026, 8, 29, 8, 0));

  interface FilaBd {
    id: string;
    numeroTren: string;
    fecha: Date;
    origenEstacionId: string;
    salida: Date;
    tripId: string | null;
  }

  function filaFeed(tripId: string, sobre: { salida?: Date } = {}) {
    return {
      numeroTren: '01234',
      fecha: FECHA,
      origenEstacionId: '17000',
      salida: sobre.salida ?? SALIDA,
      tripId,
    };
  }

  /** Doble que aplica el mismo `where` que Prisma (claves únicas + NOT IN). */
  function doble(filasBd: FilaBd[]) {
    const actualizadas: Array<{ id: string; tripId: string }> = [];
    let consultas = 0;
    const base: BaseReparacionTripIds = {
      horarioTren: {
        findMany: async (args) => {
          consultas++;
          const [porClave, porTripId] = args.where.AND;
          const claves = new Set(porClave.OR.map((r) => claveHorario(r.AND)));
          const admiteNull = porTripId.OR.some((r) => r.tripId === null);
          const fuera = porTripId.OR.flatMap((r) => (r.tripId === null ? [] : r.tripId.notIn));
          return filasBd.filter(
            (f) =>
              claves.has(claveHorario(f)) &&
              (f.tripId === null ? admiteNull : !fuera.includes(f.tripId)),
          );
        },
        update: async (args) => {
          const fila = filasBd.find((f) => f.id === args.where.id);
          if (fila) fila.tripId = args.data.tripId;
          actualizadas.push({ id: args.where.id, tripId: args.data.tripId });
        },
      },
    };
    return { base, actualizadas, consultas: () => consultas };
  }

  /** TripIds que el feed publica hoy (el set completo, no solo el lote). */
  const publicados = (...tripIds: string[]) => new Set(tripIds);

  it('actualiza el tripId cuando la unique choca con uno distinto', async () => {
    const bd: FilaBd[] = [{ id: 'h1', ...filaFeed('0123412026-09-24') }];
    const { base, actualizadas } = doble(bd);

    const reparadas = await repararTripIdsDesactualizados(
      base,
      [filaFeed('0123412026-09-29')],
      publicados('0123412026-09-29'),
    );

    expect(reparadas).toBe(1);
    expect(actualizadas).toEqual([{ id: 'h1', tripId: '0123412026-09-29' }]);
    expect(bd[0]?.tripId).toBe('0123412026-09-29');
  });

  it('no toca la fila si el tripId ya es el del feed', async () => {
    const bd: FilaBd[] = [{ id: 'h1', ...filaFeed('0123412026-09-29') }];
    const { base, actualizadas, consultas } = doble(bd);

    const reparadas = await repararTripIdsDesactualizados(
      base,
      [filaFeed('0123412026-09-29')],
      publicados('0123412026-09-29'),
    );

    expect(reparadas).toBe(0);
    expect(actualizadas).toEqual([]);
    // El NOT IN de la BD descarta la fila: no se escribe nada
    expect(consultas()).toBe(1);
  });

  it('no toca filas cuya clave única no está en el lote del feed', async () => {
    const otraSalida = new Date(SALIDA.getTime() + 60 * 60_000);
    const bd: FilaBd[] = [
      { id: 'h-otra', ...filaFeed('0123412026-09-24', { salida: otraSalida }) },
    ];
    const { base, actualizadas } = doble(bd);

    const reparadas = await repararTripIdsDesactualizados(
      base,
      [filaFeed('0123412026-09-29')],
      publicados('0123412026-09-29'),
    );

    expect(reparadas).toBe(0);
    expect(actualizadas).toEqual([]);
    expect(bd[0]?.tripId).toBe('0123412026-09-24');
  });

  it('no reescribe un viaje gemelo que el feed sigue publicando (sin oscilar)', async () => {
    // Misma unique, dos tripId vigentes: el lote trae uno y la BD tiene el otro
    const bd: FilaBd[] = [{ id: 'h1', ...filaFeed('0063242026-09-29') }];
    const { base, actualizadas } = doble(bd);

    const reparadas = await repararTripIdsDesactualizados(
      base,
      [filaFeed('0063212026-09-29')],
      publicados('0063212026-09-29', '0063242026-09-29'),
    );

    expect(reparadas).toBe(0);
    expect(actualizadas).toEqual([]);
    expect(bd[0]?.tripId).toBe('0063242026-09-29');
  });

  it('con dos viajes gemelos (misma unique) elige el menor, sin oscilar', async () => {
    const bd: FilaBd[] = [{ id: 'h1', ...filaFeed('viejo-publicacion-anterior') }];
    const { base, actualizadas } = doble(bd);

    const reparadas = await repararTripIdsDesactualizados(
      base,
      [filaFeed('0019022026-09-29'), filaFeed('0019012026-09-29')],
      publicados('0019022026-09-29', '0019012026-09-29'),
    );

    expect(reparadas).toBe(1);
    expect(actualizadas).toEqual([{ id: 'h1', tripId: '0019012026-09-29' }]);
  });

  it('sin filas no consulta la BD', async () => {
    const { base, consultas } = doble([]);
    await expect(repararTripIdsDesactualizados(base, [], publicados())).resolves.toBe(0);
    expect(consultas()).toBe(0);
  });
});
