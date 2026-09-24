import type { Logger } from 'pino';
import AdmZip from 'adm-zip';
import { getPrisma } from '@mantirenfe/database';

const URLS_GTFS_DEFECTO = [
  'https://ssl.renfe.com/gtransit/Fichero_AV_LD/google_transit.zip',
  'https://ssl.renfe.com/ftransit/Fichero_CER_FOMENTO/fomento_transit.zip',
];

function parsearCsv(contenido: string): Array<Record<string, string>> {
  const lineas = contenido.trim().split(/\r?\n/);
  const cabecera = (lineas[0] ?? '').split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
  const resultados: Array<Record<string, string>> = [];

  for (const linea of lineas.slice(1)) {
    if (!linea.trim()) continue;
    const celdas: string[] = [];
    let actual = '';
    let dentroComillas = false;
    for (let i = 0; i < linea.length; i++) {
      const char = linea[i];
      if (char === '"') {
        dentroComillas = !dentroComillas;
      } else if (char === ',' && !dentroComillas) {
        celdas.push(actual);
        actual = '';
      } else {
        actual += char;
      }
    }
    celdas.push(actual);
    const fila: Record<string, string> = {};
    cabecera.forEach((clave, index) => {
      fila[clave] = (celdas[index] ?? '').trim().replace(/^"|"$/g, '');
    });
    resultados.push(fila);
  }
  return resultados;
}

function leerEntrada(zip: AdmZip, nombre: string): string | null {
  const entrada =
    zip.getEntry(nombre) ??
    zip
      .getEntries()
      .find((e) => e.entryName.endsWith(`/${nombre}`) || e.entryName.endsWith(`\\${nombre}`));
  if (!entrada) return null;
  return entrada.getData().toString('utf8');
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

async function descargarZip(url: string, logger: Logger): Promise<AdmZip | null> {
  const controlador = new AbortController();
  const timeout = setTimeout(() => controlador.abort(), 60_000);
  try {
    const respuesta = await fetch(url, { signal: controlador.signal });
    if (!respuesta.ok) {
      logger.warn({ url, status: respuesta.status }, 'GTFS zip no disponible');
      return null;
    }
    const buffer = Buffer.from(await respuesta.arrayBuffer());
    return new AdmZip(buffer);
  } catch (error) {
    logger.warn({ url, err: error }, 'Error descargando GTFS zip');
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function urlGtfs(): string[] {
  const env = process.env.GTFS_ZIP_URLS?.trim();
  if (!env) return URLS_GTFS_DEFECTO;
  return env
    .split(',')
    .map((u) => u.trim())
    .filter(Boolean);
}

export async function sincronizarEstaciones(logger: Logger): Promise<number> {
  const prisma = getPrisma();
  let total = 0;

  for (const url of urlGtfs()) {
    const zip = await descargarZip(url, logger);
    if (!zip) continue;
    const contenido = leerEntrada(zip, 'stops.txt');
    if (!contenido) {
      logger.warn({ url }, 'stops.txt ausente en el zip');
      continue;
    }
    const filas = parsearCsv(contenido);
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

  logger.info({ count: total }, 'Estaciones GTFS sincronizadas');
  return total;
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
    const zip = await descargarZip(url, logger);
    if (!zip) continue;

    const tripsCsv = leerEntrada(zip, 'trips.txt');
    const stopTimesCsv = leerEntrada(zip, 'stop_times.txt');
    const calendarCsv = leerEntrada(zip, 'calendar.txt');
    const calendarDatesCsv = leerEntrada(zip, 'calendar_dates.txt');
    const routesCsv = leerEntrada(zip, 'routes.txt');
    const agencyCsv = leerEntrada(zip, 'agency.txt');

    if (!tripsCsv || !stopTimesCsv) {
      logger.warn({ url }, 'trips.txt/stop_times.txt ausentes, se omite este feed');
      continue;
    }

    const calendar = new Map<string, Record<string, string>>();
    if (calendarCsv) {
      for (const fila of parsearCsv(calendarCsv)) {
        if (fila.service_id) calendar.set(fila.service_id, fila);
      }
    }

    const calendarDates = new Map<string, Array<{ fecha: string; tipo: string }>>();
    if (calendarDatesCsv) {
      for (const fila of parsearCsv(calendarDatesCsv)) {
        const fecha = fechaIsoDesdeGtfs(fila.date ?? '');
        if (!fila.service_id || !fecha || !fila.exception_type) continue;
        const lista = calendarDates.get(fila.service_id) ?? [];
        lista.push({ fecha, tipo: fila.exception_type });
        calendarDates.set(fila.service_id, lista);
      }
    }

    const operadorPorRuta = new Map<string, string | null>();
    const agencyPorId = new Map<string, string>();
    if (agencyCsv) {
      for (const fila of parsearCsv(agencyCsv)) {
        if (fila.agency_id && fila.agency_name) agencyPorId.set(fila.agency_id, fila.agency_name);
      }
    }
    if (routesCsv) {
      for (const fila of parsearCsv(routesCsv)) {
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

    interface ParadaViaje {
      stopId: string;
      orden: number;
      llegada: number;
      salida: number;
    }
    const paradasPorTrip = new Map<string, ParadaViaje[]>();
    for (const fila of parsearCsv(stopTimesCsv)) {
      const tripId = fila.trip_id;
      const stopId = fila.stop_id;
      if (!tripId || !stopId) continue;
      const orden = Number(fila.stop_sequence);
      const llegada = minutosDesdeMedianoche(fila.arrival_time || fila.departure_time || '');
      const salida = minutosDesdeMedianoche(fila.departure_time || fila.arrival_time || '');
      if (!Number.isFinite(orden) || llegada === null || salida === null) continue;
      const lista = paradasPorTrip.get(tripId) ?? [];
      lista.push({ stopId, orden, llegada, salida });
      paradasPorTrip.set(tripId, lista);
    }

    const estacionesPorCodigo = new Map(
      (await prisma.estacion.findMany({ select: { id: true, codigo: true } })).map((e) => [
        e.codigo,
        e.id,
      ]),
    );

    const trips = parsearCsv(tripsCsv);
    const lote: Array<{
      numeroTren: string;
      fecha: Date;
      salida: Date;
      llegada: Date;
      operador: string | null;
      origenEstacionId: string;
      destinoEstacionId: string;
    }> = [];

    const fechasCache = new Map<string, Set<string>>();

    for (const trip of trips) {
      const tripId = trip.trip_id;
      const serviceId = trip.service_id;
      if (!tripId || !serviceId) continue;

      let fechas = fechasCache.get(serviceId);
      if (!fechas) {
        fechas = diasActivos(calendar, calendarDates, serviceId, desde, hasta);
        fechasCache.set(serviceId, fechas);
      }
      if (fechas.size === 0) continue;

      const paradas = paradasPorTrip.get(tripId);
      if (!paradas || paradas.length < 2) continue;
      paradas.sort((a, b) => a.orden - b.orden);

      const primera = paradas[0];
      const ultima = paradas[paradas.length - 1];
      if (!primera || !ultima) continue;
      const origenId = estacionesPorCodigo.get(primera.stopId);
      const destinoId = estacionesPorCodigo.get(ultima.stopId);
      if (!origenId || !destinoId || origenId === destinoId) continue;

      const numeroTren = trip.trip_short_name || trip.trip_id || 'sin-numero';
      const operador = operadorPorRuta.get(trip.route_id ?? '') ?? null;
      const duracionMin = Math.max(1, ultima.llegada - primera.salida);

      for (const fechaIso of fechas) {
        const partes = fechaIso.split('-').map(Number);
        const ano = partes[0];
        const mes = partes[1];
        const dia = partes[2];
        if (ano === undefined || mes === undefined || dia === undefined) continue;
        const base = Date.UTC(ano, mes - 1, dia);
        const salidaMs = base + primera.salida * 60_000;
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
      }
    }

    const TAM_LOTE = 500;
    for (let i = 0; i < lote.length; i += TAM_LOTE) {
      const trozo = lote.slice(i, i + TAM_LOTE);
      const resultado = await prisma.horarioTren.createMany({
        data: trozo,
        skipDuplicates: true,
      });
      insertados += resultado.count;
    }

    logger.info(
      { url, trips: trips.length, fechas: fechasCache.size, insertados },
      'Horarios GTFS importados',
    );
  }

  return insertados;
}
