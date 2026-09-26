import type { Logger } from 'pino';
import unzipper from 'unzipper';
import { getPrisma } from '@mantirenfe/database';

const URLS_GTFS_DEFECTO = [
  'https://ssl.renfe.com/gtransit/Fichero_AV_LD/google_transit.zip',
  'https://ssl.renfe.com/ftransit/Fichero_CER_FOMENTO/fomento_transit.zip',
];

/** Entries que se retienen completos (son pequeños). El resto ni se extrae. */
const ENTRADAS_PEQUENAS = [
  'stops.txt',
  'calendar.txt',
  'calendar_dates.txt',
  'routes.txt',
  'agency.txt',
  'trips.txt',
];

function memoriaMb(): number {
  const u = process.memoryUsage();
  return Math.round((u.heapUsed + u.external + u.arrayBuffers) / 1048576);
}

/** Parsea una línea CSV (con comillas) en celdas ya limpias. */
function parsearLinea(linea: string): string[] {
  const celdas: string[] = [];
  let actual = '';
  let dentroComillas = false;
  for (let i = 0; i < linea.length; i++) {
    const char = linea[i];
    if (char === '"') {
      dentroComillas = !dentroComillas;
    } else if (char === ',' && !dentroComillas) {
      celdas.push(actual.trim().replace(/^"|"$/g, ''));
      actual = '';
    } else {
      actual += char;
    }
  }
  celdas.push(actual.trim().replace(/^"|"$/g, ''));
  return celdas;
}

function parsearCsv(contenido: string | Buffer): Array<Record<string, string>> {
  const texto = typeof contenido === 'string' ? contenido : contenido.toString('utf8');
  const lineas = texto.trim().split(/\r?\n/);
  const cabecera = parsearLinea(lineas[0] ?? '');
  const resultados: Array<Record<string, string>> = [];

  for (let i = 1; i < lineas.length; i++) {
    const linea = lineas[i] ?? '';
    if (!linea.trim()) continue;
    const celdas = parsearLinea(linea);
    const fila: Record<string, string> = {};
    cabecera.forEach((clave, index) => {
      fila[clave] = celdas[index] ?? '';
    });
    resultados.push(fila);
  }
  return resultados;
}

/** Recorre un CSV Buffer línea a línea sin crear el array de líneas completo. */
function recorrerLineas(
  contenido: Buffer,
  procesarCabecera: (cabecera: string[]) => void,
  procesarLineaCb: (celdas: string[]) => void,
): void {
  let inicio = 0;
  if (
    contenido.length >= 3 &&
    contenido[0] === 0xef &&
    contenido[1] === 0xbb &&
    contenido[2] === 0xbf
  ) {
    inicio = 3;
  }
  const finCabecera = contenido.indexOf('\n', inicio);
  if (finCabecera < 0) {
    procesarCabecera(parsearLinea(contenido.toString('utf8', inicio)));
    return;
  }
  procesarCabecera(parsearLinea(contenido.toString('utf8', inicio, finCabecera)));
  inicio = finCabecera + 1;

  while (inicio < contenido.length) {
    let fin = contenido.indexOf('\n', inicio);
    if (fin < 0) fin = contenido.length;
    if (fin > inicio) {
      procesarLineaCb(parsearLinea(contenido.toString('utf8', inicio, fin)));
    }
    inicio = fin + 1;
  }
}

function minutosDesdeMedianoche(hora: string): number | null {
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(hora.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min)) return null;
  return h * 60 + min;
}

function fechaIsoDesdeGtfs(yyyymmdd: string): string | null {
  if (!/^\d{8}$/.test(yyyymmdd)) return null;
  return `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;
}

function diasActivos(
  calendar: Map<string, Record<string, string>>,
  calendarDates: Map<string, Array<{ fecha: string; tipo: string }>>,
  serviceId: string,
  desde: Date,
  hasta: Date,
): Set<string> {
  const activos = new Set<string>();
  const regla = calendar.get(serviceId);
  const excepciones = calendarDates.get(serviceId) ?? [];

  if (regla) {
    const start = regla.start_date ?? '';
    const end = regla.end_date ?? '';
    if (!/^\d{8}$/.test(start) || !/^\d{8}$/.test(end)) return activos;
    const diasSemana = [
      'sunday',
      'monday',
      'tuesday',
      'wednesday',
      'thursday',
      'friday',
      'saturday',
    ] as const;
    const isoStart = fechaIsoDesdeGtfs(start);
    const isoEnd = fechaIsoDesdeGtfs(end);
    if (!isoStart || !isoEnd) return activos;
    const cursor = new Date(`${isoStart}T00:00:00Z`);
    const fin = new Date(`${isoEnd}T00:00:00Z`);
    while (cursor <= fin) {
      const iso = cursor.toISOString().slice(0, 10);
      const dia = cursor.getUTCDay();
      const claveDia = diasSemana[dia];
      if (
        claveDia &&
        regla[claveDia] === '1' &&
        iso >= desde.toISOString().slice(0, 10) &&
        iso <= hasta.toISOString().slice(0, 10)
      ) {
        activos.add(iso);
      }
      cursor.setUTCDate(cursor.getUTCDate() + 1);
      if (activos.size > 400) break;
    }
  }

  for (const ex of excepciones) {
    if (
      ex.fecha < desde.toISOString().slice(0, 10) ||
      ex.fecha > hasta.toISOString().slice(0, 10)
    ) {
      continue;
    }
    if (ex.tipo === '1') activos.add(ex.fecha);
    if (ex.tipo === '2') activos.delete(ex.fecha);
  }
  return activos;
}

function urlGtfs(): string[] {
  const env = process.env.GTFS_ZIP_URLS?.trim();
  if (!env) return URLS_GTFS_DEFECTO;
  return env
    .split(',')
    .map((u) => u.trim())
    .filter(Boolean);
}

interface ManejadorStopTimes {
  cabecera: (celdas: string[]) => void;
  linea: (celdas: string[]) => void;
}

/**
 * Descarga un zip GTFS y recorre sus entries EN STREAMING:
 * - stop_times.txt (gigante, ~1GB descomprimido en fomento) se procesa línea a
 *   línea sin retenerse en memoria.
 * - Los entries pequeños (trips, calendar, stops...) se guardan como Buffer.
 * - El resto (shapes, etc.) ni se extrae.
 * Con adm-zip el zip entero se descomprimía en RAM (+1.3GB) y revienta los
 * contenedores free de Render (512MB) en el sync de las 04:00.
 */
async function recorrerZip(
  url: string,
  logger: Logger,
  stopTimes?: ManejadorStopTimes,
): Promise<Map<string, Buffer>> {
  const buffers = new Map<string, Buffer>();
  let descarga: Buffer | null = null;
  try {
    const respuesta = await fetch(url, { signal: AbortSignal.timeout(300_000) });
    if (!respuesta.ok) {
      logger.warn({ url, status: respuesta.status }, 'GTFS zip no disponible');
      return buffers;
    }
    // El zip crudo en RAM (27-110MB): unzipper solo descomprime los entries
    // que pedimos. (Pasarlo por streams de red hacia unzipper no mantiene el
    // event loop y el proceso moría en silencio.)
    descarga = Buffer.from(await respuesta.arrayBuffer());

    const directorio = await unzipper.Open.buffer(descarga);
    for (const entry of directorio.files) {
      const nombre = entry.path.split('/').pop() ?? '';
      if (nombre === 'stop_times.txt' && stopTimes) {
        let pendiente = Buffer.alloc(0);
        let cabeceraHecha = false;
        const procesarLinea = (linea: string) => {
          if (!cabeceraHecha) {
            stopTimes.cabecera(parsearLinea(linea));
            cabeceraHecha = true;
          } else if (linea.trim()) {
            stopTimes.linea(parsearLinea(linea));
          }
        };
        for await (const trozo of entry.stream()) {
          pendiente = Buffer.concat([pendiente, trozo as Buffer]);
          let fin = pendiente.indexOf(10);
          while (fin >= 0) {
            procesarLinea(pendiente.subarray(0, fin).toString('utf8').replace(/\r$/, ''));
            pendiente = pendiente.subarray(fin + 1);
            fin = pendiente.indexOf(10);
          }
        }
        if (pendiente.length > 0) procesarLinea(pendiente.toString('utf8'));
      } else if (ENTRADAS_PEQUENAS.includes(nombre)) {
        buffers.set(nombre, await entry.buffer());
      }
      // el resto (shapes, etc.) ni se extrae: no consume memoria
    }
  } catch (error) {
    logger.warn({ url, err: error }, 'Error recorriendo GTFS zip');
  } finally {
    descarga = null;
  }
  return buffers;
}

export async function sincronizarEstaciones(logger: Logger): Promise<number> {
  const prisma = getPrisma();
  let total = 0;

  for (const url of urlGtfs()) {
    const buffers = await recorrerZip(url, logger);
    const stops = buffers.get('stops.txt');
    buffers.clear();
    if (!stops) {
      logger.warn({ url }, 'stops.txt ausente en el zip');
      continue;
    }
    const filas = parsearCsv(stops);
    for (const fila of filas) {
      const codigo = fila.stop_id || fila.stop_code;
      const nombre = fila.stop_name;
      if (!codigo || !nombre) continue;
      const lat = Number(fila.stop_lat);
      const lon = Number(fila.stop_lon);

      await prisma.estacion.upsert({
        where: { codigo },
        update: {
          nombre,
          latitud: Number.isFinite(lat) ? lat : null,
          longitud: Number.isFinite(lon) ? lon : null,
        },
        create: {
          id: codigo,
          codigo,
          nombre,
          latitud: Number.isFinite(lat) ? lat : null,
          longitud: Number.isFinite(lon) ? lon : null,
        },
      });
      total++;
    }
  }

  logger.info({ count: total, mb: memoriaMb() }, 'Estaciones GTFS sincronizadas');
  return total;
}

interface ParadaViaje {
  stopId: string;
  orden: number;
  llegada: number;
  salida: number;
}

interface ExtremosViaje {
  primera: ParadaViaje;
  ultima: ParadaViaje;
}

interface TripLigero {
  tripId: string;
  serviceId: string;
  routeId: string;
  numeroTren: string;
}

function tripsLigeros(contenido: Buffer): TripLigero[] {
  const trips: TripLigero[] = [];
  let iTrip = -1;
  let iService = -1;
  let iRoute = -1;
  let iShort = -1;

  recorrerLineas(
    contenido,
    (cabecera) => {
      iTrip = cabecera.indexOf('trip_id');
      iService = cabecera.indexOf('service_id');
      iRoute = cabecera.indexOf('route_id');
      iShort = cabecera.indexOf('trip_short_name');
    },
    (celdas) => {
      const tripId = iTrip >= 0 ? celdas[iTrip] : '';
      const serviceId = iService >= 0 ? celdas[iService] : '';
      if (!tripId || !serviceId) return;
      trips.push({
        tripId,
        serviceId,
        routeId: iRoute >= 0 ? (celdas[iRoute] ?? '') : '',
        numeroTren: iShort >= 0 ? (celdas[iShort] ?? '') : '',
      });
    },
  );
  return trips;
}

export async function sincronizarHorarios(logger: Logger): Promise<number> {
  const prisma = getPrisma();
  const hoy = new Date();
  hoy.setUTCHours(0, 0, 0, 0);
  const desde = new Date(hoy);
  desde.setUTCDate(desde.getUTCDate() - 7);
  const hasta = new Date(hoy);
  hasta.setUTCDate(hasta.getUTCDate() + Number(process.env.GTFS_DIAS_VENTANA ?? 45));

  let insertados = 0;

  for (const url of urlGtfs()) {
    // stop_times se acumula solo en sus extremos (primera/ultima parada por trip)
    const extremos = new Map<string, ExtremosViaje>();
    let iTrip = -1;
    let iStop = -1;
    let iSeq = -1;
    let iArr = -1;
    let iDep = -1;

    const buffers = await recorrerZip(url, logger, {
      cabecera: (cabecera) => {
        iTrip = cabecera.indexOf('trip_id');
        iStop = cabecera.indexOf('stop_id');
        iSeq = cabecera.indexOf('stop_sequence');
        iArr = cabecera.indexOf('arrival_time');
        iDep = cabecera.indexOf('departure_time');
      },
      linea: (celdas) => {
        const tripId = iTrip >= 0 ? celdas[iTrip] : undefined;
        const stopId = iStop >= 0 ? celdas[iStop] : undefined;
        if (!tripId || !stopId) return;
        const orden = Number(iSeq >= 0 ? celdas[iSeq] : NaN);
        const llegada = minutosDesdeMedianoche(
          (iArr >= 0 ? celdas[iArr] : '') || (iDep >= 0 ? celdas[iDep] : '') || '',
        );
        const salida = minutosDesdeMedianoche(
          (iDep >= 0 ? celdas[iDep] : '') || (iArr >= 0 ? celdas[iArr] : '') || '',
        );
        if (!Number.isFinite(orden) || llegada === null || salida === null) return;

        const parada: ParadaViaje = { stopId, orden, llegada, salida };
        const ext = extremos.get(tripId);
        if (!ext) {
          extremos.set(tripId, { primera: parada, ultima: parada });
        } else {
          if (orden < ext.primera.orden) ext.primera = parada;
          if (orden > ext.ultima.orden) ext.ultima = parada;
        }
      },
    });

    logger.info({ fase: 'stop-times', url, mb: memoriaMb(), trips: extremos.size }, 'sync memoria');

    const tripsBuf = buffers.get('trips.txt');
    const calendarBuf = buffers.get('calendar.txt');
    const calendarDatesBuf = buffers.get('calendar_dates.txt');
    const routesBuf = buffers.get('routes.txt');
    const agencyBuf = buffers.get('agency.txt');
    buffers.clear();

    if (!tripsBuf) {
      logger.warn({ url }, 'trips.txt ausente en el zip, se omite este feed');
      continue;
    }

    const calendar = new Map<string, Record<string, string>>();
    if (calendarBuf) {
      for (const fila of parsearCsv(calendarBuf)) {
        if (fila.service_id) calendar.set(fila.service_id, fila);
      }
    }

    const calendarDates = new Map<string, Array<{ fecha: string; tipo: string }>>();
    if (calendarDatesBuf) {
      for (const fila of parsearCsv(calendarDatesBuf)) {
        const fecha = fechaIsoDesdeGtfs(fila.date ?? '');
        if (!fila.service_id || !fecha || !fila.exception_type) continue;
        const lista = calendarDates.get(fila.service_id) ?? [];
        lista.push({ fecha, tipo: fila.exception_type });
        calendarDates.set(fila.service_id, lista);
      }
    }

    const operadorPorRuta = new Map<string, string | null>();
    const agencyPorId = new Map<string, string>();
    if (agencyBuf) {
      for (const fila of parsearCsv(agencyBuf)) {
        if (fila.agency_id && fila.agency_name) agencyPorId.set(fila.agency_id, fila.agency_name);
      }
    }
    if (routesBuf) {
      for (const fila of parsearCsv(routesBuf)) {
        if (!fila.route_id) continue;
        operadorPorRuta.set(
          fila.route_id,
          fila.route_long_name ||
            fila.route_short_name ||
            agencyPorId.get(fila.agency_id ?? '') ||
            null,
        );
      }
    }

    const trips = tripsLigeros(tripsBuf);

    const estacionesPorCodigo = new Map(
      (await prisma.estacion.findMany({ select: { id: true, codigo: true } })).map((e) => [
        e.codigo,
        e.id,
      ]),
    );

    const fechasCache = new Map<string, Set<string>>();
    let lote: Array<{
      numeroTren: string;
      fecha: Date;
      salida: Date;
      llegada: Date;
      operador: string | null;
      origenEstacionId: string;
      destinoEstacionId: string;
    }> = [];

    const vaciarLote = async () => {
      if (lote.length === 0) return;
      const resultado = await prisma.horarioTren.createMany({
        data: lote,
        skipDuplicates: true,
      });
      insertados += resultado.count;
      lote = [];
    };

    for (const trip of trips) {
      const { tripId, serviceId, routeId, numeroTren: numeroTrenBruto } = trip;

      let fechas = fechasCache.get(serviceId);
      if (!fechas) {
        fechas = diasActivos(calendar, calendarDates, serviceId, desde, hasta);
        fechasCache.set(serviceId, fechas);
      }
      if (fechas.size === 0) continue;

      const ext = extremos.get(tripId);
      if (!ext) continue;
      // Equivalente a "al menos 2 paradas" del original
      if (ext.primera.orden === ext.ultima.orden) continue;

      const origenId = estacionesPorCodigo.get(ext.primera.stopId);
      const destinoId = estacionesPorCodigo.get(ext.ultima.stopId);
      if (!origenId || !destinoId || origenId === destinoId) continue;

      const numeroTren = numeroTrenBruto || tripId || 'sin-numero';
      const operador = operadorPorRuta.get(routeId) ?? null;
      const duracionMin = Math.max(1, ext.ultima.llegada - ext.primera.salida);

      for (const fechaIso of fechas) {
        const partes = fechaIso.split('-').map(Number);
        const ano = partes[0];
        const mes = partes[1];
        const dia = partes[2];
        if (ano === undefined || mes === undefined || dia === undefined) continue;
        const base = Date.UTC(ano, mes - 1, dia);
        const salidaMs = base + ext.primera.salida * 60_000;
        const llegadaMs = salidaMs + duracionMin * 60_000;
        lote.push({
          numeroTren,
          fecha: new Date(base),
          salida: new Date(salidaMs),
          llegada: new Date(llegadaMs),
          operador,
          origenEstacionId: origenId,
          destinoEstacionId: destinoId,
        });
        if (lote.length >= 500) await vaciarLote();
      }
    }
    await vaciarLote();

    logger.info(
      { url, trips: trips.length, fechas: fechasCache.size, insertados, mb: memoriaMb() },
      'Horarios GTFS importados',
    );
  }

  return insertados;
}
