import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import AdmZip from 'adm-zip';
import type { Logger } from 'pino';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cabecerasGtfs,
  fuentesGtfs,
  sincronizarEstaciones,
  sincronizarHorarios,
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

const { prismaMock, store } = vi.hoisted(() => {
  const store = {
    estaciones: new Map<string, EstacionGuardada>(),
    horarios: [] as Array<{
      numeroTren: string;
      operador: string | null;
      tripId?: string | null;
      origenEstacionId: string;
      destinoEstacionId: string;
    }>,
    paradas: [] as ParadaGuardada[],
    estacionesUpsert: [] as string[],
    estacionesCreateMany: [] as string[],
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
      createMany: async (args: {
        data: Array<{
          numeroTren: string;
          operador: string | null;
          origenEstacionId: string;
          destinoEstacionId: string;
        }>;
      }) => {
        store.horarios.push(...args.data);
        return { count: args.data.length };
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
});
