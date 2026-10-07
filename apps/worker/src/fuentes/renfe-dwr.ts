import type {
  ConsultaDisponibilidad,
  EstadoDisponibilidad,
  EstadoTrenDisponible,
} from '@mantirenfe/shared-types';
import { cruzarConexiones, type TramoHorario } from '@mantirenfe/shared-types';
import { buscarEstaciones, getPrisma } from '@mantirenfe/database';
import json5 from 'json5';
// Caché con single-flight, compartida con el resto de fuentes (gtfs-rt)
import { conCache, type EntradaCache } from './cache';
import type { FuenteDatosTren } from './tipos';

// Re-exportado para no romper a nadie que lo importara de este fichero
export { conCache, type EntradaCache };

/**
 * Consulta de disponibilidad y precios contra la venta de Renfe usando el
 * protocolo DWR (Direct Web Remoting) de venta.renfe.com/vol.
 *
 * Flujo: sesión homeCustomers.do (cookies del servidor) -> cookie Search ->
 * buscarTren.do -> __System.generateId (token) -> actualizaObjetosSesion ->
 * getTrainsList (listadoTrenes con tarifas y disponibilidad).
 *
 * Portado de renfe_mcp (MIT, belgrano9/renfe_mcp_server) por su autoría original.
 */
const HOME_URL = 'https://venta.renfe.com/vol/homeCustomers.do';
const SEARCH_URL = 'https://venta.renfe.com/vol/buscarTren.do?Idioma=es&Pais=ES';
const DWR_BASE = 'https://venta.renfe.com/vol/dwr/call/plaincall/';
const SYSTEM_ID_URL = `${DWR_BASE}__System.generateId.dwr`;
const UPDATE_SESSION_URL = `${DWR_BASE}buyEnlacesManager.actualizaObjetosSesion.dwr`;
const TRAIN_LIST_URL = `${DWR_BASE}trainEnlacesManager.getTrainsList.dwr`;
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

const CARACTERES_TOKEN = '1234567890abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ*$';

function tokenify(numero: number): string {
  let resto = Math.floor(numero);
  const letras: string[] = [];
  while (resto > 0) {
    letras.push(CARACTERES_TOKEN[resto & 0x3f]!);
    resto = Math.floor(resto / 64);
  }
  return letras.join('');
}

function crearSearchId(): string {
  const posibles = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let resultado = '_';
  for (let i = 0; i < 4; i++) {
    resultado += posibles[Math.floor(Math.random() * posibles.length)];
  }
  return resultado;
}

function scriptSessionId(token: string): string {
  return `${token}/${tokenify(Date.now())}-${tokenify(Math.floor(Math.random() * 1e16))}`;
}

function payloadGenerateId(batchId: number, searchId: string | null): string {
  const page =
    searchId === null
      ? 'page=%2Fvol%2FbuscarTrenEnlaces.do\n'
      : `page=%2Fvol%2FbuscarTrenEnlaces.do%3Fc%3D${searchId}\n`;
  return (
    'callCount=1\n' +
    'c0-scriptName=__System\n' +
    'c0-methodName=generateId\n' +
    'c0-id=0\n' +
    `batchId=${batchId}\n` +
    'instanceId=0\n' +
    page +
    'scriptSessionId=\n' +
    'windowName=\n'
  );
}

function payloadUpdateSession(batchId: number, searchId: string, scriptSessionId: string): string {
  return (
    'callCount=1\n' +
    'windowName=\n' +
    'c0-scriptName=buyEnlacesManager\n' +
    'c0-methodName=actualizaObjetosSesion\n' +
    'c0-id=0\n' +
    `c0-e1=string:${searchId}\n` +
    'c0-e2=string:\n' +
    'c0-param0=array:[reference:c0-e1,reference:c0-e2]\n' +
    `batchId=${batchId}\n` +
    'instanceId=0\n' +
    `page=%2Fvol%2FbuscarTrenEnlaces.do%3Fc%3D${searchId}\n` +
    `scriptSessionId=${scriptSessionId}\n`
  );
}

function payloadTrainList(
  batchId: number,
  searchId: string,
  scriptSessionId: string,
  fechaSalida: string,
): string {
  const fecha = encodeURIComponent(fechaSalida);
  return (
    'callCount=1\n' +
    'windowName=\n' +
    'c0-scriptName=trainEnlacesManager\n' +
    'c0-methodName=getTrainsList\n' +
    'c0-id=0\n' +
    'c0-e1=string:false\n' +
    'c0-e2=string:false\n' +
    'c0-e3=string:false\n' +
    'c0-e4=string:\n' +
    'c0-e5=string:\n' +
    'c0-e6=string:\n' +
    'c0-e7=string:\n' +
    `c0-e8=string:${fecha}\n` +
    'c0-e9=string:\n' +
    'c0-e10=string:1\n' +
    'c0-e11=string:0\n' +
    'c0-e12=string:0\n' +
    'c0-e13=string:I\n' +
    'c0-e14=string:\n' +
    'c0-param0=Object_Object:{atendo:reference:c0-e1, sinEnlace:reference:c0-e2, ' +
    'plazaH:reference:c0-e3, tipoFranjaI:reference:c0-e4, tipoFranjaV:reference:c0-e5, ' +
    'horaFranjaIda:reference:c0-e6, horaFranjaVuelta:reference:c0-e7, fechaSalida:reference' +
    `:c0-e8, fechaVuelta:reference:c0-e9, adultos:reference:c0-e10, ninos:reference:c0-e11,` +
    ' ninosMenores:reference:c0-e12, trayecto:reference:c0-e13, idaVuelta:reference:c0-e14}\n' +
    `batchId=${batchId}\n` +
    'instanceId=0\n' +
    `page=%2Fvol%2FbuscarTrenEnlaces.do%3Fc%3D${searchId}\n` +
    `scriptSessionId=${scriptSessionId}\n`
  );
}

export interface TramoVenta {
  cdgoTren?: string;
  fecha?: string;
  tipoTren?: string;
  horaSalida?: string;
  horaLlegada?: string;
  descripcionEstacionOrigen?: string;
  descripcionEstacionDestino?: string;
}

export interface TarifaVenta {
  titulo?: string;
  precioTarifa?: string;
}

export interface TrenVenta {
  cdgoTren?: string;
  fecha?: string;
  tipoTren?: string;
  horaSalida?: string;
  horaLlegada?: string;
  tarifaMinima?: string | null;
  completo?: boolean;
  razonNoDisponible?: string;
  soloPlazaH?: boolean;
  duracionViajeTotalEnMinutos?: number;
  tipoTrenUno?: string;
  tipoTrenDos?: string;
  numeroTren?: string;
  numTren?: string;
  codigoTren?: string;
  idTren?: string;
  /** true si Renfe lo lista como tren directo; false = combinación de 2 tramos */
  directo?: boolean;
  tarifasDisponibles?: TarifaVenta[];
  trayectos?: TramoVenta[];
}

interface RespuestaLista {
  listadoTrenes?: Array<{ listviajeViewEnlaceBean?: TrenVenta[] }>;
}

export function disponibleSegunReglas(tren: TrenVenta): boolean {
  return (
    !(tren.completo ?? true) &&
    ['', '8'].includes(tren.razonNoDisponible ?? '') &&
    tren.tarifaMinima != null &&
    !(tren.soloPlazaH ?? true)
  );
}

/** Precio de una tarifa del listado ("43,5" → 43.5); NaN si no se puede leer. */
function precioDeTarifa(tarifa: TarifaVenta): number {
  return Number(String(tarifa.precioTarifa ?? '').replace(',', '.'));
}

/** "21:29:00" (o "21:29") → "21:29"; null si no es una hora HH:MM legible. */
function horaHhmm(valor: string | null | undefined): string | null {
  const hhmm = (valor ?? '').slice(0, 5);
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(hhmm) ? hhmm : null;
}

/**
 * Minutos de espera entre la llegada al enlace y la salida del segundo tramo.
 * Solo se calcula si las dos horas existen y no hay cruce de medianoche (la
 * venta no trae la fecha de cada tramo, así que un valor negativo no es fiable):
 * en ese caso se omite `esperaMin` y la UI se queda con las dos horas.
 */
function esperaEnEnlace(llegada: string | null, salida: string | null): number | undefined {
  if (!llegada || !salida) return undefined;
  const aMinutos = (h: string) => Number(h.slice(0, 2)) * 60 + Number(h.slice(3, 5));
  const espera = aMinutos(salida) - aMinutos(llegada);
  return espera >= 0 ? espera : undefined;
}

/**
 * "Tipo de billete" que corresponde al `tarifaMinima` que mostramos: si alguna
 * tarifa del listado tiene ese precio, se usa su título; si no, el de menor
 * precio. Es lo que permite distinguir dos filas del mismo tren y la misma
 * hora que solo cambian en la tarifa (Básico / Elige / Adulto ida...).
 */
export function tarifaMasBarata(tren: TrenVenta): string | undefined {
  const conTitulo = (tren.tarifasDisponibles ?? []).filter(
    (t): t is TarifaVenta & { titulo: string } => typeof t.titulo === 'string' && t.titulo !== '',
  );
  if (conTitulo.length === 0) return undefined;
  const minima =
    tren.tarifaMinima != null ? Number(tren.tarifaMinima.replace(',', '.')) : Number.NaN;
  if (Number.isFinite(minima)) {
    const exacta = conTitulo.find((t) => precioDeTarifa(t) === minima);
    if (exacta) return exacta.titulo;
  }
  const conPrecio = conTitulo.filter((t) => Number.isFinite(precioDeTarifa(t)));
  if (conPrecio.length > 0) {
    return conPrecio.reduce((a, b) => (precioDeTarifa(b) < precioDeTarifa(a) ? b : a)).titulo;
  }
  return conTitulo[0]?.titulo;
}

/**
 * Convierte una fila del listado DWR en `EstadoTrenDisponible`.
 *
 * El listado mezcla trenes **directos** (`directo: true`) con **combinaciones
 * de dos tramos** (`trayectos.length > 1`, p. ej. 09201 A Coruña→Santiago +
 * 00622 Santiago→Vigo). Antes se tomaba `trayectos[0].cdgoTren` como número, así
 * que dos conexiones que compartían el primer tramo salían como DOS filas
 * idénticas ("09201 a las 21:00") con precios distintos, y nadie podía ver que
 * la diferencia estaba en el segundo tren. Ahora:
 *  - una conexión lista los dos tramos en `numeroTren` ("09201 + 00622"), con
 *    lo que `trenId` deja de colisionar y cada fila es identificable;
 *  - `tramo`/`conexionEn` marcan la conexión ("conexión en Santiago"), con las
 *    horas de enlace (`conexionLlegada`/`conexionSalida`/`esperaMin`);
 *  - se exponen `horaLlegada`, `duracionMin` (rápido/lento), `tipoTren` y
 *    `tarifa` (tipo de billete).
 */
export function mapearTrenesVenta(
  lista: TrenVenta[],
  fechaIso: string,
  codigos: { origen: string; destino: string },
): EstadoTrenDisponible[] {
  return lista.map((t) => {
    const tramos = t.trayectos ?? [];
    const numeros = tramos.map((x) => x.cdgoTren).filter((n): n is string => Boolean(n));
    const esConexion = t.directo === false || tramos.length > 1;
    const numero =
      numeros[0] ?? t.cdgoTren ?? t.numeroTren ?? t.numTren ?? t.codigoTren ?? t.idTren;
    const combinado = esConexion && numeros.length > 1 ? numeros.join(' + ') : undefined;
    const numeroTren = combinado ?? numero ?? 'desconocido';
    const identificador = combinado ?? numero ?? `${codigos.origen}-${codigos.destino}`;
    const fechaTren = t.fecha ?? tramos[0]?.fecha ?? fechaIso;
    const llegada = t.horaLlegada ?? tramos[tramos.length - 1]?.horaLlegada;
    const tipos = [t.tipoTrenUno, t.tipoTrenDos].filter((x): x is string => Boolean(x));
    const tipoTren = tipos.length > 0 ? tipos.join(' + ') : tramos[0]?.tipoTren;
    const transbordo = esConexion ? tramos[0]?.descripcionEstacionDestino : undefined;

    const fila: EstadoTrenDisponible = {
      trenId: `${identificador}-${fechaTren}`,
      numeroTren,
      salida: t.horaSalida ? t.horaSalida.slice(0, 5) : '',
      disponible: disponibleSegunReglas(t),
      precioMin: t.tarifaMinima ? Number(t.tarifaMinima.replace(',', '.')) : null,
      moneda: 'EUR' as const,
      tramo: esConexion ? 'conexion' : 'directo',
    };
    if (transbordo) fila.conexionEn = transbordo;
    if (esConexion) {
      // Horas en la estación de enlace: llega el primer tramo, sale el segundo
      const llegadaEnlace = horaHhmm(tramos[0]?.horaLlegada);
      const salidaEnlace = horaHhmm(tramos[1]?.horaSalida);
      if (llegadaEnlace) fila.conexionLlegada = llegadaEnlace;
      if (salidaEnlace) fila.conexionSalida = salidaEnlace;
      const espera = esperaEnEnlace(llegadaEnlace, salidaEnlace);
      if (espera !== undefined) fila.esperaMin = espera;
    }
    if (llegada) fila.horaLlegada = llegada.slice(0, 5);
    if (typeof t.duracionViajeTotalEnMinutos === 'number' && t.duracionViajeTotalEnMinutos > 0) {
      fila.duracionMin = t.duracionViajeTotalEnMinutos;
    }
    if (tipoTren) fila.tipoTren = tipoTren;
    const tarifa = tarifaMasBarata(t);
    if (tarifa) fila.tarifa = tarifa;
    return fila;
  });
}

/**
 * Comparación de dos filas del mismo tren+salida: gana la "mejor" con el
 * criterio documentado **directo > conexión**, después **precio conocido > sin
 * precio** y por último **precio más bajo**.
 */
function puntuacionFila(tren: EstadoTrenDisponible): number[] {
  const precio =
    typeof tren.precioMin === 'number' && Number.isFinite(tren.precioMin)
      ? tren.precioMin
      : Number.POSITIVE_INFINITY;
  return [tren.tramo === 'conexion' ? 1 : 0, Number.isFinite(precio) ? 0 : 1, precio];
}

function mejorFila(a: EstadoTrenDisponible, b: EstadoTrenDisponible): EstadoTrenDisponible {
  const pa = puntuacionFila(a);
  const pb = puntuacionFila(b);
  for (let i = 0; i < pa.length; i++) {
    if (pa[i] !== pb[i]) return (pa[i] ?? 0) < (pb[i] ?? 0) ? a : b;
  }
  return a;
}

/**
 * Elimina duplicados reales: dos filas con el mismo `trenId` Y la misma `salida`
 * son indistinguibles para la UI y para los diffs (además la UI usaría la misma
 * clave de React). Conserva la primera en orden de aparición salvo que haya una
 * mejor según `mejorFila`. Las conexiones con distinto segundo tramo NO se
 * eliminan: tienen `trenId` distinto y son opciones distintas.
 */
export function deduplicarTrenes(trenes: EstadoTrenDisponible[]): EstadoTrenDisponible[] {
  const porClave = new Map<string, EstadoTrenDisponible>();
  for (const tren of trenes) {
    const clave = `${tren.trenId}|${tren.salida}`;
    const previa = porClave.get(clave);
    porClave.set(clave, previa ? mejorFila(previa, tren) : tren);
  }
  return [...porClave.values()];
}

/**
 * El filtro `numeroTren` de una alerta debe seguir casando con una conexión:
 * "09201 + 00622" contiene al tren 09201 que el usuario pidió vigilar.
 */
export function coincideNumeroTren(numeroTren: string, buscado: string): boolean {
  return numeroTren === buscado || numeroTren.split(' + ').includes(buscado);
}

async function textoConTimeout(
  url: string,
  init: RequestInit,
  timeoutMs = 30_000,
): Promise<Response> {
  const controlador = new AbortController();
  const timeout = setTimeout(() => controlador.abort(), timeoutMs);
  try {
    const respuesta = await fetch(url, { ...init, signal: controlador.signal });
    if (!respuesta.ok) {
      // El status viaja en el error: el 429/503 de la venta no es un fallo
      // de red normal y se trata aparte (ver `getDisponibilidad`)
      const error = new Error(`HTTP ${respuesta.status} en ${new URL(url).pathname}`) as Error & {
        status?: number;
      };
      error.status = respuesta.status;
      throw error;
    }
    return respuesta;
  } finally {
    clearTimeout(timeout);
  }
}

function extraerToken(respuesta: string): string {
  const coincidencia = /r\.handleCallback\("[^"]+","[^"]+","([^"]+)"\)/.exec(respuesta);
  if (!coincidencia?.[1]) throw new Error('No se pudo extraer el token DWR');
  return coincidencia[1];
}

export function extraerListaTrenes(respuesta: string): RespuestaLista {
  const coincidencia = /r\.handleCallback\([^,]+,\s*[^,]+,\s*(\{[\s\S]*\})\);/.exec(respuesta);
  if (!coincidencia?.[1]) throw new Error('No se pudo extraer el listado de trenes DWR');
  const json = coincidencia[1].replace(/｜/g, '|');
  return json5.parse(json) as RespuestaLista;
}

// Caché compartida entre instancias: varias alertas de la misma ruta+fecha
// comparten una única consulta a venta.renfe.com.
const CACHE_VENTA = new Map<string, EntradaCache<EstadoTrenDisponible[]>>();

// Protección anti-rate-limit: si la venta responde con errores repetidos se
// suspenden las consultas con backoff exponencial (1, 2, 5 y 10 min) en vez de
// seguir martillearla. El contador solo lo limpia una consulta REAL exitosa:
// un acierto de caché no demuestra que la venta vuelva a responder.
const FALLOS_MAXIMOS = 4;
const BACKOFF_MS = [60_000, 120_000, 300_000, 600_000];
/** Pausa fija cuando la venta responde 429/503 (nos pide parar ya). */
const SUSPENSION_RATE_LIMIT_MS = 10 * 60_000;
let fallosConsecutivos = 0;
let suspendidoHasta = 0;

export class FuenteRenfeDwr implements FuenteDatosTren {
  readonly nombre = 'dwr';

  async getDisponibilidad(consulta: ConsultaDisponibilidad): Promise<EstadoDisponibilidad> {
    if (Date.now() < suspendidoHasta) {
      throw new Error(
        'Disponibilidad suspendida temporalmente tras errores de venta.renfe.com (protección anti-rate-limit)',
      );
    }
    const prisma = getPrisma();
    const [estacionesOrigen, estacionesDestino] = await Promise.all([
      buscarEstaciones(prisma, consulta.origenNombre, 5),
      buscarEstaciones(prisma, consulta.destinoNombre, 5),
    ]);
    const origen = estacionesOrigen[0];
    const destino = estacionesDestino[0];
    if (!origen || !destino) {
      throw new Error(
        `Estaciones no encontradas para ${consulta.origenNombre} -> ${consulta.destinoNombre}`,
      );
    }

    const ttlMs = Number(process.env.DWR_CACHE_SEG ?? '120') * 1000;
    const claveCache = `${origen.codigo}-${destino.codigo}-${consulta.fecha}`;
    const previa = CACHE_VENTA.get(claveCache);
    // Si la entrada ya estaba viva, esta llamada no toca la venta: no cuenta
    // como consulta real (ni para limpiar el contador de fallos)
    const desdeCache = previa !== undefined && previa.caduca > Date.now();
    let trenes: EstadoTrenDisponible[];
    try {
      trenes = await conCache(CACHE_VENTA, claveCache, ttlMs, () =>
        consultarVentaDwr(origen, destino, consulta.fecha),
      );
      // Sin tren directo (ej. A Coruña → Valencia): se consulta la disponibilidad
      // de los tramos de una conexión (A→X y X→B) y se combinan.
      if (trenes.length === 0 && !consulta.numeroTren) {
        const porConexion = await this.consultarPorConexion(
          prisma,
          origen,
          destino,
          consulta.fecha,
          ttlMs,
        );
        if (porConexion) trenes = porConexion;
      }
      if (!desdeCache) fallosConsecutivos = 0;
    } catch (error) {
      const status = (error as { status?: number }).status;
      if (status === 429 || status === 503) {
        // La venta nos pide pausa: se corta de inmediato y sin sumar al
        // contador de fallos normales (eso dispararía el backoff dos veces)
        suspendidoHasta = Math.max(suspendidoHasta, Date.now()) + SUSPENSION_RATE_LIMIT_MS;
        throw error;
      }
      fallosConsecutivos += 1;
      const indice = Math.min(fallosConsecutivos - 1, BACKOFF_MS.length - 1);
      const esperaMs = BACKOFF_MS[indice] ?? SUSPENSION_RATE_LIMIT_MS;
      suspendidoHasta = Math.max(suspendidoHasta, Date.now()) + esperaMs;
      if (fallosConsecutivos >= FALLOS_MAXIMOS) fallosConsecutivos = 0;
      throw error;
    }

    const filtrados = consulta.numeroTren
      ? trenes.filter((t) => coincideNumeroTren(t.numeroTren, consulta.numeroTren ?? ''))
      : trenes;
    return { consulta, trenes: filtrados, consultadoEn: new Date().toISOString() };
  }

  /**
   * Ruta sin tren directo: cruza los horarios de A→X y X→B en la BD, consulta a
   * la venta la disponibilidad de cada tramo (con caché por ruta) y combina:
   * la conexión está disponible si los DOS tramos lo están (precio = suma).
   */
  private async consultarPorConexion(
    prisma: ReturnType<typeof getPrisma>,
    origen: { id: string; codigo: string; nombre: string },
    destino: { id: string; codigo: string; nombre: string },
    fechaIso: string,
    ttlMs: number,
  ): Promise<EstadoTrenDisponible[] | null> {
    const fecha = new Date(`${fechaIso}T00:00:00Z`);
    const selectTramo = {
      numeroTren: true,
      salida: true,
      llegada: true,
      operador: true,
      origenEstacionId: true,
      destinoEstacionId: true,
      origen: { select: { nombre: true, codigo: true } },
      destino: { select: { nombre: true, codigo: true } },
    } as const;
    const [salientes, entrantes] = await Promise.all([
      prisma.horarioTren.findMany({
        where: { origenEstacionId: origen.id, destinoEstacionId: { notIn: [destino.id] }, fecha },
        orderBy: { salida: 'asc' },
        take: 100,
        select: selectTramo,
      }),
      prisma.horarioTren.findMany({
        where: { destinoEstacionId: destino.id, origenEstacionId: { notIn: [origen.id] }, fecha },
        orderBy: { salida: 'asc' },
        take: 100,
        select: selectTramo,
      }),
    ]);
    const aTramo = (h: (typeof salientes)[number]): TramoHorario => ({
      numeroTren: h.numeroTren,
      origenNombre: h.origen.nombre,
      destinoNombre: h.destino.nombre,
      origenEstacionId: h.origenEstacionId,
      destinoEstacionId: h.destinoEstacionId,
      salida: h.salida,
      llegada: h.llegada,
      operador: h.operador,
    });
    const conexiones = cruzarConexiones(salientes.map(aTramo), entrantes.map(aTramo), 10);
    if (conexiones.length === 0) return null;

    // Estaciones intermedias (X) de cada conexión
    const intermedias = new Map<string, { codigo: string; nombre: string }>();
    for (const id of new Set(conexiones.map((c) => c.primera.destinoEstacionId))) {
      const x = await prisma.estacion.findUnique({
        where: { id },
        select: { codigo: true, nombre: true },
      });
      if (x) intermedias.set(id, x);
    }

    const porRuta = new Map<string, EstadoTrenDisponible[]>();
    const obtenerTramo = async (
      de: { codigo: string; nombre: string },
      a: { codigo: string; nombre: string },
    ) => {
      const clave = `${de.codigo}-${a.codigo}-${fechaIso}`;
      const cacheado = porRuta.get(clave);
      if (cacheado) return cacheado;
      const lista = await conCache(CACHE_VENTA, clave, ttlMs, () =>
        consultarVentaDwr(de, a, fechaIso),
      );
      porRuta.set(clave, lista);
      return lista;
    };

    const resultado: EstadoTrenDisponible[] = [];
    for (const c of conexiones) {
      const x = intermedias.get(c.primera.destinoEstacionId);
      if (!x) continue;
      const tramo1 = await obtenerTramo(origen, x);
      const tramo2 = await obtenerTramo(x, destino);
      const t1 = tramo1.find((t) => t.numeroTren === c.primera.numeroTren);
      const t2 = tramo2.find((t) => t.numeroTren === c.segunda.numeroTren);
      if (!t1 || !t2) continue;
      resultado.push({
        trenId: `c-${fechaIso}-${c.primera.numeroTren}-${c.segunda.numeroTren}`,
        numeroTren: `${c.primera.numeroTren} + ${c.segunda.numeroTren}`,
        salida: c.primera.salida.toISOString().slice(11, 16),
        disponible: t1.disponible && t2.disponible,
        precioMin:
          t1.precioMin != null && t2.precioMin != null
            ? Math.round((t1.precioMin + t2.precioMin) * 100) / 100
            : null,
        moneda: 'EUR' as const,
        tramo: 'conexion',
        conexionEn: x.nombre,
        conexionLlegada: c.primera.llegada.toISOString().slice(11, 16),
        conexionSalida: c.segunda.salida.toISOString().slice(11, 16),
        esperaMin: c.esperaMin,
        horaLlegada: c.segunda.llegada.toISOString().slice(11, 16),
        duracionMin: Math.max(
          1,
          Math.round((c.segunda.llegada.getTime() - c.primera.salida.getTime()) / 60_000),
        ),
      });
    }
    return resultado.length > 0 ? deduplicarTrenes(resultado) : null;
  }
}

export async function consultarVentaDwr(
  origen: { codigo: string; nombre: string },
  destino: { codigo: string; nombre: string },
  fechaIso: string,
): Promise<EstadoTrenDisponible[]> {
  const searchId = crearSearchId();
  let batchId = 0;
  const cookieBusqueda = encodeURIComponent(
    JSON.stringify({
      origen: { code: origen.codigo, name: origen.nombre },
      destino: { code: destino.codigo, name: destino.nombre },
      pasajerosAdultos: 1,
      pasajerosNinos: 0,
      pasajerosSpChild: 0,
    }),
  );
  const cabecerosBase = {
    'user-agent': UA,
    accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'accept-language': 'es-ES,es;q=0.9,en;q=0.8',
  };

  // 0) Sesión del servidor (JSESSIONID + WAF): sin ella buscarTren.do devuelve 500
  const respuestaHome = await textoConTimeout(HOME_URL, {
    headers: { ...cabecerosBase, accept: 'text/html' },
  });
  const cookiesServidor = (respuestaHome.headers.getSetCookie?.() ?? [])
    .map((c) => c.split(';')[0])
    .join('; ');
  const cookieBase = [cookiesServidor, `Search=${cookieBusqueda}`].filter(Boolean).join('; ');

  const cabeceros = (cookieExtra?: string, referer = HOME_URL): Record<string, string> => ({
    ...cabecerosBase,
    cookie: cookieExtra ? `${cookieBase}; ${cookieExtra}` : cookieBase,
    referer,
  });

  // 1) Inicializar la búsqueda de la venta
  const [anio, mes, dia] = fechaIso.split('-');
  const fechaLarga = `${dia}/${mes}/${anio}`;
  const form = new URLSearchParams({
    tipoBusqueda: 'autocomplete',
    currenLocation: 'menuBusqueda',
    vengoderenfecom: 'SI',
    desOrigen: origen.nombre,
    desDestino: destino.nombre,
    cdgoOrigen: origen.codigo,
    cdgoDestino: destino.codigo,
    idiomaBusqueda: 'ES',
    FechaIdaSel: fechaLarga,
    FechaVueltaSel: '',
    _fechaIdaVisual: fechaLarga,
    _fechaVueltaVisual: '',
    adultos_: '1',
    ninos_: '0',
    ninosMenores: '0',
    codPromocional: '',
    plazaH: 'false',
    sinEnlace: 'false',
    asistencia: 'false',
    franjaHoraI: '',
    franjaHoraV: '',
    Idioma: 'es',
    Pais: 'ES',
  });
  await textoConTimeout(SEARCH_URL, {
    method: 'POST',
    headers: { ...cabeceros(), 'content-type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  });

  // 2) Token DWR (dos llamadas: priming y con searchId)
  const primerGenerate = payloadGenerateId(batchId++, null);
  await textoConTimeout(SYSTEM_ID_URL, {
    method: 'POST',
    headers: { ...cabeceros(), 'content-type': 'text/plain; charset=utf-8' },
    body: primerGenerate,
  });
  const segundaGenerate = payloadGenerateId(batchId++, searchId);
  const respuestaToken = await textoConTimeout(SYSTEM_ID_URL, {
    method: 'POST',
    headers: { ...cabeceros(), 'content-type': 'text/plain; charset=utf-8' },
    body: segundaGenerate,
  });
  const token = extraerToken(await respuestaToken.text());
  const cookieSesion = `DWRSESSIONID=${token}`;
  const scriptSession = scriptSessionId(token);

  // 3) Actualizar sesión
  await textoConTimeout(UPDATE_SESSION_URL, {
    method: 'POST',
    headers: {
      ...cabeceros(cookieSesion, SEARCH_URL.replace(/\?.*/, '')),
      'content-type': 'text/plain; charset=utf-8',
    },
    body: payloadUpdateSession(batchId++, searchId, scriptSession),
  });

  // 4) Listado de trenes con tarifas
  const respuestaLista = await textoConTimeout(TRAIN_LIST_URL, {
    method: 'POST',
    headers: {
      ...cabeceros(cookieSesion, SEARCH_URL.replace(/\?.*/, '')),
      'content-type': 'text/plain; charset=utf-8',
    },
    body: payloadTrainList(batchId, searchId, scriptSession, fechaLarga),
  });
  const datos = extraerListaTrenes(await respuestaLista.text());

  const origenDireccion = datos.listadoTrenes?.[0]?.listviajeViewEnlaceBean ?? [];
  return deduplicarTrenes(
    mapearTrenesVenta(origenDireccion, fechaIso, {
      origen: origen.codigo,
      destino: destino.codigo,
    }),
  );
}
