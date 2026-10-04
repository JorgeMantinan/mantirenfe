import type { Logger } from 'pino';
import unzipper from 'unzipper';
import { getPrisma } from '@mantirenfe/database';
import { hoyGtfs } from './reloj';

const URLS_GTFS_DEFECTO = [
  'https://ssl.renfe.com/gtransit/Fichero_AV_LD/google_transit.zip',
  'https://ssl.renfe.com/ftransit/Fichero_CER_FOMENTO/fomento_transit.zip',
];

/** Un feed a sincronizar: de dónde se descarga y con qué operador se guarda. */
export interface FuenteGtfs {
  url: string;
  /**
   * Operador impuesto a todas las filas del feed. Solo lo traen los feeds
   * secundarios: el GTFS de OUIGO publica la ruta ("MADRID-CHAMARTIN -- ...")
   * en route_long_name, no el nombre del operador.
   */
  operador?: string;
}

function listaUrlsGtfs(variable: string, defecto: string[]): string[] {
  const valor = process.env[variable]?.trim();
  if (!valor) return defecto;
  return valor
    .split(',')
    .map((u) => u.trim())
    .filter(Boolean);
}

/**
 * Feeds GTFS a sincronizar: los principales (`GTFS_ZIP_URLS`, Renfe) y, solo
 * si se configuran, los multioperador (`GTFS_ZIP_URLS_OUIGO`, todas sus filas
 * con operador OUIGO). Sin esa variable no se descarga nada de Ouigo.
 */
export function fuentesGtfs(): FuenteGtfs[] {
  const principales = listaUrlsGtfs('GTFS_ZIP_URLS', URLS_GTFS_DEFECTO).map((url) => ({ url }));
  const ouigo = listaUrlsGtfs('GTFS_ZIP_URLS_OUIGO', []).map((url) => ({
    url,
    operador: 'OUIGO',
  }));
  return [...principales, ...ouigo];
}

/**
 * El Punto de Acceso Nacional (nap.transportes.gob.es) exige una ApiKey
 * gratuita en la cabecera `ApiKey`. La clave solo viaja a ese dominio: nunca
 * se envía a hosts de terceros.
 */
export function cabecerasGtfs(url: string): Record<string, string> | undefined {
  const clave = process.env.NAP_API_KEY?.trim();
  if (!clave) return undefined;
  if (!url.includes('nap.transportes.gob.es')) return undefined;
  return { ApiKey: clave };
}

/** Entries que se retienen completos (son pequeños). El resto ni se extrae. */
const ENTRADAS_PEQUENAS = [
  'stops.txt',
  'calendar.txt',
  'calendar_dates.txt',
  'routes.txt',
  'agency.txt',
  'trips.txt',
];

/**
 * Filas por createMany de ParadaHorario. 10k filas ≈1MB de parámetros: grande
 * suficiente para que el viaje a la BD no domine el sync, pequeño para no
 * desbancar la memoria del contenedor free (512MB).
 */
const TAM_LOTE_PARADAS = 10_000;
/** Chunks de id para los deleteMany (el límite de parámetros de PG es65.535). */
const TAM_LOTE_IDS = 5_000;
/** Filas por createMany de Estacion (5 campos: cómodamente bajo el límite de PG). */
const TAM_LOTE_ESTACIONES = 5_000;

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

interface ManejadorStopTimes {
  cabecera: (celdas: string[]) => void;
  /**
   * `linea` puede ser asíncrona: así el volcado de ParadaHorario a la BD (en
   * lotes de10k) se intercala con el streaming del zip sin acumular los1,66M
   * de filas en memoria. El `await` dentro del bucle del stream aplica
   * backpressure natural (el stream se frena mientras se escribe).
   */
  linea: (celdas: string[]) => void | Promise<void>;
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
    const respuesta = await fetch(url, {
      headers: cabecerasGtfs(url),
      signal: AbortSignal.timeout(300_000),
    });
    if (!respuesta.ok) {
      if (respuesta.status === 401 && url.includes('nap.transportes.gob.es')) {
        logger.warn(
          { url },
          'GTFS del NAP rechazado (401): falta NAP_API_KEY — alta gratuita en nap.transportes.gob.es',
        );
      } else {
        logger.warn({ url, status: respuesta.status }, 'GTFS zip no disponible');
      }
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
        const procesarLinea = async (linea: string) => {
          if (!cabeceraHecha) {
            stopTimes.cabecera(parsearLinea(linea));
            cabeceraHecha = true;
          } else if (linea.trim()) {
            await stopTimes.linea(parsearLinea(linea));
          }
        };
        for await (const trozo of entry.stream()) {
          pendiente = Buffer.concat([pendiente, trozo as Buffer]);
          let fin = pendiente.indexOf(10);
          while (fin >= 0) {
            await procesarLinea(pendiente.subarray(0, fin).toString('utf8').replace(/\r$/, ''));
            pendiente = pendiente.subarray(fin + 1);
            fin = pendiente.indexOf(10);
          }
        }
        if (pendiente.length > 0) await procesarLinea(pendiente.toString('utf8'));
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

/** Fila de `Estacion` lista para el alta masiva. */
interface EstacionAlta {
  id: string;
  codigo: string;
  nombre: string;
  latitud: number | null;
  longitud: number | null;
}

/** Datos actualizables de una estación (agrupados en un solo updateMany). */
type EstacionCambio = Pick<EstacionAlta, 'nombre' | 'latitud' | 'longitud'>;

function trocear<T>(items: T[], tam: number): T[][] {
  const lotes: T[][] = [];
  for (let inicio = 0; inicio < items.length; inicio += tam) {
    lotes.push(items.slice(inicio, inicio + tam));
  }
  return lotes;
}

export async function sincronizarEstaciones(logger: Logger): Promise<number> {
  const prisma = getPrisma();
  let total = 0;

  // Estado previo: sin él haría un upsert por estación (N idas y vuelta a la
  // BD). Con él se separa lo que se da de alta de lo que hay que actualizar y
  // las estaciones intactas no se tocan.
  const previas = await prisma.estacion.findMany({
    select: { codigo: true, nombre: true, latitud: true, longitud: true },
  });
  const porCodigo = new Map(previas.map((e) => [e.codigo, e]));

  for (const fuente of fuentesGtfs()) {
    const buffers = await recorrerZip(fuente.url, logger);
    const stops = buffers.get('stops.txt');
    buffers.clear();
    if (!stops) {
      logger.warn({ url: fuente.url }, 'stops.txt ausente en el zip');
      continue;
    }
    const filas = parsearCsv(stops);

    const aCrear: EstacionAlta[] = [];
    // Un updateMany por payload idéntico: `updateMany` no admite datos distintos
    // por fila, y en un feed real la mayoría de filas caen en el mismo grupo
    const cambios = new Map<string, { datos: EstacionCambio; codigos: string[] }>();

    for (const fila of filas) {
      const codigo = fila.stop_id || fila.stop_code;
      const nombre = fila.stop_name;
      if (!codigo || !nombre) continue;
      const lat = Number(fila.stop_lat);
      const lon = Number(fila.stop_lon);
      const registro: EstacionAlta = {
        id: codigo,
        codigo,
        nombre,
        latitud: Number.isFinite(lat) ? lat : null,
        longitud: Number.isFinite(lon) ? lon : null,
      };

      const previa = porCodigo.get(codigo);
      if (!previa) {
        porCodigo.set(codigo, registro);
        aCrear.push(registro);
        continue;
      }
      // Feed secundario (OUIGO): solo da de alta lo que falte. Así su
      // tipografía ("MADRID CHAMARTIN") no pisa nombres/coordenadas de los
      // feeds principales.
      if (fuente.operador) continue;
      if (
        previa.nombre === registro.nombre &&
        previa.latitud === registro.latitud &&
        previa.longitud === registro.longitud
      ) {
        continue;
      }
      const datos: EstacionCambio = {
        nombre: registro.nombre,
        latitud: registro.latitud,
        longitud: registro.longitud,
      };
      const clave = JSON.stringify(datos);
      const grupo = cambios.get(clave) ?? { datos, codigos: [] };
      grupo.codigos.push(codigo);
      cambios.set(clave, grupo);
    }

    for (const lote of trocear(aCrear, TAM_LOTE_ESTACIONES)) {
      const creadas = await prisma.estacion.createMany({ data: lote, skipDuplicates: true });
      total += creadas.count;
    }
    for (const { datos, codigos } of cambios.values()) {
      for (const lote of trocear(codigos, TAM_LOTE_IDS)) {
        const actualizadas = await prisma.estacion.updateMany({
          where: { codigo: { in: lote } },
          data: datos,
        });
        total += actualizadas.count;
      }
      for (const codigo of codigos) {
        porCodigo.set(codigo, { ...(porCodigo.get(codigo) ?? { codigo }), ...datos });
      }
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

/**
 * Acumula la primera/última parada de un trip (la de `orden` mínimo y la de
 * `orden` máximo). Compartido por el sync y por `filasDeFeed` para que el
 * backfill calcule EXACTAMENTE los mismos extremos que inserta el sync.
 */
function registrarExtremo(
  extremos: Map<string, ExtremosViaje>,
  tripId: string,
  parada: ParadaViaje,
): void {
  const ext = extremos.get(tripId);
  if (!ext) {
    extremos.set(tripId, { primera: parada, ultima: parada });
    return;
  }
  if (parada.orden < ext.primera.orden) ext.primera = parada;
  if (parada.orden > ext.ultima.orden) ext.ultima = parada;
}

/** `calendar.txt` + `calendar_dates.txt` ya indexados, igual que en el sync. */
function leerCalendarios(
  calendarBuf?: Buffer,
  calendarDatesBuf?: Buffer,
): {
  calendar: Map<string, Record<string, string>>;
  calendarDates: Map<string, Array<{ fecha: string; tipo: string }>>;
} {
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
  return { calendar, calendarDates };
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

interface ParadaHorarioCruda {
  tripId: string;
  orden: number;
  estacionId: string;
  llegadaMin: number | null;
  salidaMin: number | null;
}

type ClientePrisma = ReturnType<typeof getPrisma>;

/**
 * Ejecuta un borrado por chunks de ids: un solo `deleteMany` con los114k trips
 * de CER superaría el límite de65.535 parámetros de Postgres.
 */
async function borrarPorChunks(
  ids: string[],
  borrar: (chunk: string[]) => Promise<{ count: number }>,
): Promise<number> {
  let total = 0;
  for (let i = 0; i < ids.length; i += TAM_LOTE_IDS) {
    const resultado = await borrar(ids.slice(i, i + TAM_LOTE_IDS));
    total += resultado.count;
  }
  return total;
}

/**
 * Fila de `HorarioTren` reducida a los 4 campos de su unique
 * `[numeroTren, fecha, origenEstacionId, salida]` + el tripId del feed.
 */
export interface FilaClaveHorario {
  numeroTren: string;
  fecha: Date;
  origenEstacionId: string;
  salida: Date;
  tripId: string;
}

/** Pedidos mínimos a la BD para reparar tripIds (Prisma real o un doble). */
export interface BaseReparacionTripIds {
  horarioTren: {
    findMany: (args: {
      where: {
        AND: [
          /** Claves únicas exactas del lote (la unique garantiza ≤1 fila por clave) */
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
          /** Solo filas cuyo tripId NO es el del feed (o que no tienen) */
          { OR: Array<{ tripId: null } | { tripId: { notIn: string[] } }> },
        ];
      };
      select: {
        id: true;
        numeroTren: true;
        fecha: true;
        origenEstacionId: true;
        salida: true;
        tripId: true;
      };
      take?: number;
    }) => Promise<
      Array<{
        id: string;
        numeroTren: string;
        fecha: Date;
        origenEstacionId: string;
        salida: Date;
        tripId: string | null;
      }>
    >;
    update: (args: { where: { id: string }; data: { tripId: string } }) => Promise<unknown>;
  };
}

function claveDeFila(f: {
  numeroTren: string;
  fecha: Date;
  origenEstacionId: string;
  salida: Date;
}): string {
  return `${f.numeroTren}|${f.fecha.toISOString()}|${f.origenEstacionId}|${f.salida.toISOString()}`;
}

/**
 * El feed de Larga Distancia regenera los tripId con cada publicación
 * (`0019012026-09-24` → `0019012026-09-29`) y `HorarioTren` los guarda con
 * `createMany(skipDuplicates)`: la unique `[numeroTren, fecha, origen, salida]`
 * salta la fila NUEVA y conserva la vieja, con un tripId que ya no está en
 * `ParadaHorario` → los cruces por paradas intermedias devuelven 0.
 *
 * Esta función repara esas filas: busca las de ESTE lote cuyo tripId no es
 * ninguno de los que trae el feed y, si su clave única coincide con una fila
 * del lote, la actualiza al tripId actual. Medido (2026-09-29): 1.391 de 1.466
 * filas LD de hoy.
 *
 * - El `findMany` busca por las claves únicas EXACTAS del lote: la unique
 *   garantiza ≤1 fila por clave, así que el pedido no se trunca (un filtro
 *   `fecha IN + numeroTren IN` devolvía hasta 26k filas y cortaba por `take`).
 *   El `tripId NOT IN` descarta en la BD las filas ya correctas: en régimen
 *   normal devuelve 0 filas y no se escribe nada.
 * - `tripIdsPublicados` son TODOS los tripIds vigentes del feed: sin ellos, dos
 *   viajes gemelos con la misma clave única (p. ej. `006321…` y `006324…`, los
 *   dos existentes en `ParadaHorario`) se irían reescribiendo mutuamente cada
 *   sync, porque cada lote solo ve los gemelos que le tocan. Medido: 358
 *   "reparaciones" por pasada que no arreglaban nada.
 * - Con viajes gemelos (dos tripId con la misma clave única) se elige el menor
 *   de forma determinista, así el resultado no oscila entre syncs.
 * - Solo se tocan filas cuya clave está en el feed: las filas huérfanas (cuya
 *   programación ya no existe) no tienen tripId con el que sustituirlas.
 *
 * Devuelve el número de UPDATEs ejecutados.
 */
export async function repararTripIdsDesactualizados(
  cliente: BaseReparacionTripIds,
  filas: FilaClaveHorario[],
  tripIdsPublicados: ReadonlySet<string>,
): Promise<number> {
  if (filas.length === 0) return 0;

  // Una entrada por clave única: con viajes gemelos gana el menor tripId.
  const porClave = new Map<string, FilaClaveHorario>();
  const tripIdsFeed = new Set<string>();
  for (const fila of filas) {
    tripIdsFeed.add(fila.tripId);
    const clave = claveDeFila(fila);
    const previa = porClave.get(clave);
    if (previa === undefined || fila.tripId < previa.tripId) porClave.set(clave, fila);
  }
  const unicas = [...porClave.values()];

  const candidatas = await cliente.horarioTren.findMany({
    where: {
      AND: [
        {
          OR: unicas.map((clave) => ({
            AND: {
              numeroTren: clave.numeroTren,
              fecha: clave.fecha,
              origenEstacionId: clave.origenEstacionId,
              salida: clave.salida,
            },
          })),
        },
        { OR: [{ tripId: null }, { tripId: { notIn: [...tripIdsFeed] } }] },
      ],
    },
    select: {
      id: true,
      numeroTren: true,
      fecha: true,
      origenEstacionId: true,
      salida: true,
      tripId: true,
    },
    // ≤1 fila por clave única (la unique lo garantiza): el tope es exacto
    take: unicas.length,
  });

  let reparadas = 0;
  for (const existente of candidatas) {
    // Vigente en el feed (viaje gemelo de la misma clave única): no se toca
    if (existente.tripId !== null && tripIdsPublicados.has(existente.tripId)) continue;
    const nuevo = porClave.get(claveDeFila(existente))?.tripId;
    if (nuevo === undefined || nuevo === existente.tripId) continue;
    await cliente.horarioTren.update({ where: { id: existente.id }, data: { tripId: nuevo } });
    reparadas++;
  }
  return reparadas;
}

/**
 * Filas que `sincronizarHorarios` insertaría para el feed `url` dentro de la
 * ventana [desde, hasta]: mismas claves únicas y mismo tripId que el sync.
 * Existe para que el backfill puntual (`scripts/backfill-tripids.ts`) repare
 * `HorarioTren.tripId` con el MISMO parser, sin duplicar la lógica.
 *
 * `estaciones` es el mapa código → id que usa el sync: aplica el mismo filtro
 * de FK y la misma clave de `origenEstacionId` que `sincronizarHorarios` (sin
 * él se devolverían claves que el sync nunca inserta).
 */
export async function filasDeFeed(
  url: string,
  logger: Logger,
  desde: Date,
  hasta: Date,
  estaciones: ReadonlyMap<string, string>,
): Promise<FilaClaveHorario[]> {
  const extremos = new Map<string, ExtremosViaje>();
  let iTrip = -1;
  let iStop = -1;
  let iSeq = -1;
  let iArr = -1;
  let iDep = -1;

  const buffers = await recorrerZip(url, logger, {
    cabecera: (celdas) => {
      iTrip = celdas.indexOf('trip_id');
      iStop = celdas.indexOf('stop_id');
      iSeq = celdas.indexOf('stop_sequence');
      iArr = celdas.indexOf('arrival_time');
      iDep = celdas.indexOf('departure_time');
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
      registrarExtremo(extremos, tripId, { stopId, orden, llegada, salida });
    },
  });

  const tripsBuf = buffers.get('trips.txt');
  const calendarBuf = buffers.get('calendar.txt');
  const calendarDatesBuf = buffers.get('calendar_dates.txt');
  buffers.clear();
  if (!tripsBuf) {
    logger.warn({ url }, 'trips.txt ausente en el zip, no hay filas que reparar');
    return [];
  }
  const { calendar, calendarDates } = leerCalendarios(calendarBuf, calendarDatesBuf);

  const fechasCache = new Map<string, Set<string>>();
  const filas: FilaClaveHorario[] = [];
  for (const trip of tripsLigeros(tripsBuf)) {
    let fechas = fechasCache.get(trip.serviceId);
    if (!fechas) {
      fechas = diasActivos(calendar, calendarDates, trip.serviceId, desde, hasta);
      fechasCache.set(trip.serviceId, fechas);
    }
    if (fechas.size === 0) continue;

    const ext = extremos.get(trip.tripId);
    if (!ext || ext.primera.orden === ext.ultima.orden) continue;
    const origenEstacionId = estaciones.get(ext.primera.stopId);
    const destinoEstacionId = estaciones.get(ext.ultima.stopId);
    if (!origenEstacionId || !destinoEstacionId || origenEstacionId === destinoEstacionId) {
      continue;
    }

    const numeroTren = trip.numeroTren || trip.tripId || 'sin-numero';
    for (const fechaIso of fechas) {
      const partes = fechaIso.split('-').map(Number);
      const ano = partes[0];
      const mes = partes[1];
      const dia = partes[2];
      if (ano === undefined || mes === undefined || dia === undefined) continue;
      const base = Date.UTC(ano, mes - 1, dia);
      filas.push({
        numeroTren,
        fecha: new Date(base),
        origenEstacionId,
        salida: new Date(base + ext.primera.salida * 60_000),
        tripId: trip.tripId,
      });
    }
  }
  logger.info({ url, filas: filas.length, trips: extremos.size }, 'Filas de feed leídas');
  return filas;
}

/**
 * Retira de ParadaHorario los trips que ya no aparecen en los feeds
 * sincronizados (servicio retirado, feed fuera de configuración...): sin esto
 * la tabla crecería sin límite y nos comería la cuota free de Supabase.
 *
 * Solo se llama cuando TODOS los feeds se han procesado: si un feed falla, sus
 * trips no están en `conocidos` y le borraríamos todas las paradas.
 */
async function limpiarParadasObsoletas(
  cliente: ClientePrisma,
  conocidos: Set<string>,
  logger: Logger,
): Promise<void> {
  const enBd = await cliente.paradaHorario.findMany({
    distinct: ['tripId'],
    select: { tripId: true },
  });
  const obsoletos = enBd.map((p) => p.tripId).filter((tripId) => !conocidos.has(tripId));
  if (obsoletos.length === 0) return;
  const borrados = await borrarPorChunks(obsoletos, (chunk) =>
    cliente.paradaHorario.deleteMany({ where: { tripId: { in: chunk } } }),
  );
  logger.info({ obsoletos: obsoletos.length, borrados }, 'Paradas GTFS obsoletas retiradas');
}

export async function sincronizarHorarios(logger: Logger): Promise<number> {
  const prisma = getPrisma();
  // "Hoy" en el reloj peninsular (el mismo con el que se guardan las fechas
  // GTFS): con el de UTC la ventana se desplazaba 1-2 h en el cambio de hora
  const hoy = new Date(`${hoyGtfs()}T00:00:00Z`);
  const desde = new Date(hoy);
  desde.setUTCDate(desde.getUTCDate() - 7);
  const hasta = new Date(hoy);
  hasta.setUTCDate(hasta.getUTCDate() + Number(process.env.GTFS_DIAS_VENTANA ?? 45));

  // Se resuelve una sola vez: el streaming de stop_times necesita saber a qué
  // estación pertenece cada parada (hay FK a Estacion) y no cambia durante el
  // run (sincronizarEstaciones corre antes).
  const estacionesPorCodigo = new Map(
    (
      await prisma.estacion.findMany({
        select: { id: true, codigo: true },
      })
    ).map((e) => [e.codigo, e.id]),
  );

  // Backfill de HorarioTren.tripId: las filas creadas antes de la migración no
  // pueden "completarse" con createMany (el @@unique las salta), así que se
  // borran para que este mismo run las recrie con tripId. Solo afecta a filas
  // SIN tripId dentro de la ventana: tras el primer sync ya no queda ninguna y
  // este count devuelve0 (coste residual en los runs siguientes).
  const sinTripId = await prisma.horarioTren.count({
    where: { fecha: { gte: desde, lte: hasta }, tripId: null },
  });
  if (sinTripId > 0) {
    logger.info({ filas: sinTripId }, 'Repoblando horarios de la ventana sin tripId');
  }

  let insertados = 0;
  let insertadasParadas = 0;
  /** tripIds de HorarioTren reescritos al tripId de la publicación actual. */
  let tripIdsReparados = 0;
  const feeds = fuentesGtfs();
  const tripsConocidos = new Set<string>();
  let feedsOk = 0;

  for (const fuente of feeds) {
    const url = fuente.url;
    const inicioFeed = Date.now();
    // stop_times se acumula solo en sus extremos (primera/ultima parada por trip)
    const extremos = new Map<string, ExtremosViaje>();
    // Trips vistos en stop_times: van a ParadaHorario aunque no estén en trips.txt
    const tripsStopTimes = new Set<string>();
    let loteParadas: ParadaHorarioCruda[] = [];
    let errorParadas: unknown = null;
    let msParadas = 0;
    let filasParadas = 0;
    let iTrip = -1;
    let iStop = -1;
    let iSeq = -1;
    let iArr = -1;
    let iDep = -1;

    /** Escribe un lote y deja constancia de cuánto se tarda en la BD. */
    const vaciarLoteParadas = async () => {
      if (loteParadas.length === 0) return;
      const lote = loteParadas;
      loteParadas = [];
      const inicio = Date.now();
      try {
        const resultado = await prisma.paradaHorario.createMany({
          data: lote,
          skipDuplicates: true,
        });
        insertadasParadas += resultado.count;
      } catch (error) {
        // Un fallo aquí (tabla sin migrar, cuota...) no debe tumbar el sync de
        // horarios: se corta el volcado de este feed y el próximo run lo
        // reintenta. No se borra nada, así que no se pierde información.
        if (!errorParadas) {
          errorParadas = error;
          logger.error({ url, err: error }, 'No se pudieron guardar las paradas GTFS');
        }
      } finally {
        msParadas += Date.now() - inicio;
      }
    };

    const buffers = await recorrerZip(url, logger, {
      cabecera: (cabecera) => {
        iTrip = cabecera.indexOf('trip_id');
        iStop = cabecera.indexOf('stop_id');
        iSeq = cabecera.indexOf('stop_sequence');
        iArr = cabecera.indexOf('arrival_time');
        iDep = cabecera.indexOf('departure_time');
      },
      linea: async (celdas) => {
        const tripId = iTrip >= 0 ? celdas[iTrip] : undefined;
        const stopId = iStop >= 0 ? celdas[iStop] : undefined;
        if (!tripId || !stopId) return;
        tripsStopTimes.add(tripId);
        const orden = Number(iSeq >= 0 ? celdas[iSeq] : NaN);
        const llegada = minutosDesdeMedianoche(
          (iArr >= 0 ? celdas[iArr] : '') || (iDep >= 0 ? celdas[iDep] : '') || '',
        );
        const salida = minutosDesdeMedianoche(
          (iDep >= 0 ? celdas[iDep] : '') || (iArr >= 0 ? celdas[iArr] : '') || '',
        );
        if (!Number.isFinite(orden) || llegada === null || salida === null) return;

        // ParadaHorario: TODA la parada del trip (no solo extremos), sin fecha.
        // Se descartan las paradas cuya estación no exista en Estacion (FK).
        const estacionId = estacionesPorCodigo.get(stopId);
        if (estacionId && !errorParadas) {
          loteParadas.push({ tripId, orden, estacionId, llegadaMin: llegada, salidaMin: salida });
          filasParadas++;
          if (loteParadas.length >= TAM_LOTE_PARADAS) await vaciarLoteParadas();
          if (filasParadas % 200_000 === 0) {
            logger.info(
              {
                fase: 'paradas',
                url,
                leidas: filasParadas,
                insertadas: insertadasParadas,
                msParadas,
                ms: Date.now() - inicioFeed,
                mb: memoriaMb(),
              },
              'progreso ParadaHorario',
            );
          }
        }

        const parada: ParadaViaje = { stopId, orden, llegada, salida };
        registrarExtremo(extremos, tripId, parada);
      },
    });
    await vaciarLoteParadas();

    const msFeed = Date.now() - inicioFeed;
    logger.info(
      {
        fase: 'stop-times',
        url,
        mb: memoriaMb(),
        trips: extremos.size,
        filasParadas,
        insertadas: insertadasParadas,
        msParadas,
        msStream: msFeed - msParadas,
        ms: msFeed,
        paradasError: errorParadas ? String(errorParadas) : undefined,
      },
      'sync memoria',
    );

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

    const { calendar, calendarDates } = leerCalendarios(calendarBuf, calendarDatesBuf);

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
    // Los trips de este feed protegen sus paradas de la limpieza final
    for (const trip of trips) tripsConocidos.add(trip.tripId);
    for (const tripId of tripsStopTimes) tripsConocidos.add(tripId);
    // TripIds vigentes de ESTE feed (los de stop_times cuentan aunque no
    // estén en trips.txt): con ellos la reparación no reescribe viajes gemelos
    // que el feed sigue publicando.
    const tripIdsDelFeed = new Set<string>([...trips.map((t) => t.tripId), ...tripsStopTimes]);

    if (sinTripId > 0) {
      // Acotado a los numeroTren de ESTE feed: si falla a mitad, las filas del
      // otro feed (con otro rango de numeroTren) siguen intactas.
      const numeros = new Set<string>();
      for (const trip of trips) numeros.add(trip.numeroTren || trip.tripId || 'sin-numero');
      const borradas = await borrarPorChunks([...numeros], (chunk) =>
        prisma.horarioTren.deleteMany({
          where: {
            fecha: { gte: desde, lte: hasta },
            tripId: null,
            numeroTren: { in: chunk },
          },
        }),
      );
      logger.info(
        { url, numeros: numeros.size, borradas },
        'Horarios sin tripId retirados para reinsertarlos con tripId',
      );
    }

    const fechasCache = new Map<string, Set<string>>();
    let lote: Array<{
      numeroTren: string;
      fecha: Date;
      salida: Date;
      llegada: Date;
      operador: string | null;
      tripId: string;
      origenEstacionId: string;
      destinoEstacionId: string;
    }> = [];

    const vaciarLote = async () => {
      if (lote.length === 0) return;
      const filas = lote;
      lote = [];
      const resultado = await prisma.horarioTren.createMany({
        data: filas,
        skipDuplicates: true,
      });
      insertados += resultado.count;
      // Si createMany ha saltado filas es que su unique ya existía en la BD:
      // puede ser el tripId de una publicación anterior (Larga Distancia los
      // regenera con la fecha de alta). Sin este pase la fila conservaría el id
      // viejo y el cruce con ParadaHorario (que sí tiene el id nuevo) no cuadra.
      // Solo se repara si el feed trae tripIds con sufijo de fecha (AV/LD):
      // en CER son estables y reparar sus113k trips por lotes de500 alargaba
      // el sync de Actions por encima del timeout (cancelado 2 veces).
      const feedConFechas = filas.some((f) => /\d{4}-\d{2}-\d{2}$/.test(f.tripId));
      if (resultado.count < filas.length && feedConFechas) {
        const reparadas = await repararTripIdsDesactualizados(prisma, filas, tripIdsDelFeed);
        if (reparadas > 0) {
          tripIdsReparados += reparadas;
          logger.info({ url, reparadas }, 'tripIds de HorarioTren actualizados al feed actual');
        }
      }
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
      // Los feeds secundarios imponen su operador: en el GTFS de OUIGO
      // route_long_name es la ruta ("MADRID-CHAMARTIN -- ..."), no el operador.
      const operador = fuente.operador ?? operadorPorRuta.get(routeId) ?? null;
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
          tripId,
          origenEstacionId: origenId,
          destinoEstacionId: destinoId,
        });
        if (lote.length >= 500) await vaciarLote();
      }
    }
    await vaciarLote();
    if (errorParadas) {
      // Las paradas de este feed no están completas: cuenta como feed fallido
      // para que la limpieza final no borre paradas de otros trips
      logger.warn(
        { url, err: String(errorParadas) },
        'Feed de horarios importado sin sus paradas GTFS',
      );
    } else {
      feedsOk++;
    }

    logger.info(
      {
        url,
        trips: trips.length,
        fechas: fechasCache.size,
        insertados,
        paradas: insertadasParadas,
        msParadas,
        ms: Date.now() - inicioFeed,
        mb: memoriaMb(),
      },
      'Horarios GTFS importados',
    );
  }

  // Limpieza final de ParadaHorario: solo con todos los feeds correctos.
  if (feeds.length > 0 && feedsOk === feeds.length) {
    try {
      await limpiarParadasObsoletas(prisma, tripsConocidos, logger);
    } catch (error) {
      logger.warn({ err: error }, 'No se pudieron limpiar las paradas GTFS obsoletas');
    }
  } else {
    logger.warn(
      { feedsOk, feeds: feeds.length },
      'Limpieza de paradas GTFS obsoletas omitida (algún feed falló)',
    );
  }

  logger.info(
    { insertados, insertadasParadas, tripIdsReparados, mb: memoriaMb() },
    'Horarios GTFS sincronizados',
  );
  return insertados;
}
