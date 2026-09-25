import type {
  ConsultaDisponibilidad,
  EstadoDisponibilidad,
  EstadoTrenDisponible,
} from '@mantirenfe/shared-types';
import { buscarEstaciones, getPrisma } from '@mantirenfe/database';
import json5 from 'json5';
import type { FuenteDatosTren } from './tipos';

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

interface TrenVenta {
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
  trayectos?: Array<{ cdgoTren?: string; fecha?: string }>;
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

async function textoConTimeout(
  url: string,
  init: RequestInit,
  timeoutMs = 30_000,
): Promise<Response> {
  const controlador = new AbortController();
  const timeout = setTimeout(() => controlador.abort(), timeoutMs);
  try {
    const respuesta = await fetch(url, { ...init, signal: controlador.signal });
    if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status} en ${new URL(url).pathname}`);
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

export interface EntradaCache<T> {
  valor: T;
  caduca: number;
}

/**
 * Caché genérica con TTL: si la entrada está viva no se vuelve a calcular.
 * Poda entradas caducadas cuando crece demasiado.
 */
export async function conCache<T>(
  cache: Map<string, EntradaCache<T>>,
  clave: string,
  ttlMs: number,
  calcular: () => Promise<T>,
): Promise<T> {
  const ahora = Date.now();
  const entrada = cache.get(clave);
  if (entrada && entrada.caduca > ahora) return entrada.valor;

  const valor = await calcular();
  if (cache.size > 200) {
    for (const [k, v] of cache) {
      if (v.caduca <= ahora) cache.delete(k);
    }
  }
  cache.set(clave, { valor, caduca: Date.now() + ttlMs });
  return valor;
}

// Compartida entre instancias: varias alertas de la misma ruta+fecha
// comparten una única consulta a venta.renfe.com.
const CACHE_VENTA = new Map<string, EntradaCache<EstadoTrenDisponible[]>>();

// Protección anti-rate-limit: si la venta responde con errores repetidos,
// suspendemos las consultas durante un rato en vez de seguir martillearla.
const FALLOS_MAXIMOS = 4;
const SUSPENSION_MS = 10 * 60_000;
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
    let trenes: EstadoTrenDisponible[];
    try {
      trenes = await conCache(CACHE_VENTA, claveCache, ttlMs, () =>
        this.consultarVenta(origen, destino, consulta.fecha),
      );
      fallosConsecutivos = 0;
    } catch (error) {
      fallosConsecutivos += 1;
      if (fallosConsecutivos >= FALLOS_MAXIMOS) {
        suspendidoHasta = Date.now() + SUSPENSION_MS;
        fallosConsecutivos = 0;
      }
      throw error;
    }

    const filtrados = consulta.numeroTren
      ? trenes.filter((t) => t.numeroTren === consulta.numeroTren)
      : trenes;
    return { consulta, trenes: filtrados, consultadoEn: new Date().toISOString() };
  }

  private async consultarVenta(
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
      body: payloadTrainList(batchId++, searchId, scriptSession, fechaLarga),
    });
    const datos = extraerListaTrenes(await respuestaLista.text());

    const origenDireccion = datos.listadoTrenes?.[0]?.listviajeViewEnlaceBean ?? [];
    return origenDireccion.map((t) => {
      const tramo = t.trayectos?.[0];
      const numero =
        tramo?.cdgoTren ?? t.cdgoTren ?? t.numeroTren ?? t.numTren ?? t.codigoTren ?? t.idTren;
      const fechaTren = t.fecha ?? tramo?.fecha ?? fechaIso;
      const salida = t.horaSalida ? t.horaSalida.slice(0, 5) : '';
      return {
        trenId: `${numero ?? `${origen.codigo}-${destino.codigo}`}-${fechaTren}`,
        numeroTren: numero ?? 'desconocido',
        salida,
        disponible: disponibleSegunReglas(t),
        precioMin: t.tarifaMinima ? Number(t.tarifaMinima.replace(',', '.')) : null,
        moneda: 'EUR' as const,
      };
    });
  }
}
