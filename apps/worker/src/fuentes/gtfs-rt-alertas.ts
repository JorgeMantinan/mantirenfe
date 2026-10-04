/**
 * Parser del feed GTFS-RT de alertas de Renfe (alerts.pb, se actualiza cada 20 s).
 *
 * El feed es un `FeedMessage` protobuf, pero el repo no depende de ninguna
 * librería de protocol buffers (los demás feeds GTFS-RT de Renfe se sirven en
 * JSON), así que aquí se decodifica a mano solo el subconjunto de campos que
 * usamos: FeedMessage{header, entity[]}, FeedEntity{id, is_deleted, alert} y
 * Alert{active_period, informed_entity, cause, effect, url, header_text,
 * description_text}. Cualquier campo desconocido se salta sin más.
 *
 * Nota: Renfe publica el Alert dentro de FeedEntity en el campo 5 (algunos
 * generadores lo ponen en el 3), por eso se aceptan los dos.
 */

// Caché corta del feed (se renueva cada 20 s) con single-flight compartido
import { conCache, type EntradaCache } from './cache';

const TTL_ALERTAS_MS = 20_000;
const CACHE_ALERTAS = new Map<string, EntradaCache<Buffer>>();

const TIPO_VARINT = 0;
const TIPO_FIJO64 = 1;
const TIPO_BLOQUE = 2;
const TIPO_FIJO32 = 5;

const CAMPOS_ALERTA_CONOCIDOS = new Set([1, 5, 6, 7, 8, 10, 11]);

/** Causas GTFS-RT (enumerado Cause) traducidas para el usuario final. */
const CAUSAS: Record<number, string> = {
  1: 'Causa desconocida',
  2: 'Otra causa',
  3: 'Problema técnico',
  4: 'Huelga',
  5: 'Manifestación',
  6: 'Accidente',
  7: 'Día festivo',
  8: 'Climatología',
  9: 'Mantenimiento',
  10: 'Obras',
  11: 'Actuación policial',
  12: 'Emergencia médica',
};

/** Efectos GTFS-RT (enumerado Effect) traducidos para el usuario final. */
const EFECTOS: Record<number, string> = {
  1: 'Sin servicio',
  2: 'Servicio reducido',
  3: 'Retrasos significativos',
  4: 'Desvío',
  5: 'Servicio adicional',
  6: 'Servicio modificado',
  7: 'Otro efecto',
  8: 'Efecto desconocido',
  9: 'Parada desplazada',
  10: 'Sin efecto',
  11: 'Problema de accesibilidad',
};

export interface AlertaGtfsRt {
  id: string;
  titulo: string | null;
  mensaje: string | null;
  causa: string | null;
  desde: Date | null;
  hasta: Date | null;
  stopIds: string[];
  routeIds: string[];
  tripIds: string[];
}

interface Periodo {
  inicio: number | null;
  fin: number | null;
}

interface AlertaParseada {
  periodos: Periodo[];
  stopIds: string[];
  routeIds: string[];
  tripIds: string[];
  causa: number | null;
  efecto: number | null;
  titulo: string | null;
  mensaje: string | null;
}

interface Lector {
  readonly buf: Buffer;
  pos: number;
}

interface Campo {
  numero: number;
  tipo: number;
}

function leerVarint(l: Lector): bigint {
  let resultado = 0n;
  let desplazamiento = 0n;
  for (;;) {
    if (l.pos >= l.buf.length) throw new Error('GTFS_RT_PROTO_TRUNCADO');
    const byte = l.buf.readUInt8(l.pos);
    l.pos += 1;
    resultado |= BigInt(byte & 0x7f) << desplazamiento;
    desplazamiento += 7n;
    if ((byte & 0x80) === 0) break;
    if (desplazamiento > 70n) throw new Error('GTFS_RT_PROTO_VARINT_INVALIDO');
  }
  return resultado;
}

function leerCampo(l: Lector): Campo | null {
  if (l.pos >= l.buf.length) return null;
  const tag = leerVarint(l);
  const numero = Number(tag >> 3n);
  const tipo = Number(tag & 7n);
  if (numero <= 0) throw new Error('GTFS_RT_PROTO_TAG_INVALIDO');
  return { numero, tipo };
}

function leerBloque(l: Lector): Buffer {
  const longitud = Number(leerVarint(l));
  const fin = l.pos + longitud;
  if (!Number.isSafeInteger(longitud) || longitud < 0 || fin > l.buf.length) {
    throw new Error('GTFS_RT_PROTO_TRUNCADO');
  }
  const bloque = l.buf.subarray(l.pos, fin);
  l.pos = fin;
  return bloque;
}

function saltarCampo(l: Lector, tipo: number): void {
  if (tipo === TIPO_VARINT) {
    leerVarint(l);
  } else if (tipo === TIPO_BLOQUE) {
    leerBloque(l);
  } else if (tipo === TIPO_FIJO64 || tipo === TIPO_FIJO32) {
    const bytes = tipo === TIPO_FIJO64 ? 8 : 4;
    if (l.pos + bytes > l.buf.length) throw new Error('GTFS_RT_PROTO_TRUNCADO');
    l.pos += bytes;
  } else {
    throw new Error('GTFS_RT_PROTO_TIPO_DESCONOCIDO');
  }
}

/** Recorre un mensaje llamando a `alCampo` por cada campo (que debe consumirlo). */
function recorrer(buf: Buffer, alCampo: (campo: Campo, l: Lector) => void): void {
  const l: Lector = { buf, pos: 0 };
  while (l.pos < buf.length) {
    const campo = leerCampo(l);
    if (!campo) break;
    alCampo(campo, l);
  }
}

function texto(buf: Buffer): string {
  return buf.toString('utf8');
}

/** TranslatedString: se queda con la traducción en español o con la primera. */
function traducir(buf: Buffer): string | null {
  let mejor: string | null = null;
  recorrer(buf, (campo, l) => {
    if (campo.numero === 1 && campo.tipo === TIPO_BLOQUE) {
      const entrada = leerBloque(l);
      let contenido: string | null = null;
      let idioma = '';
      recorrer(entrada, (c, li) => {
        if (c.numero === 1 && c.tipo === TIPO_BLOQUE) contenido = texto(leerBloque(li));
        else if (c.numero === 2 && c.tipo === TIPO_BLOQUE) idioma = texto(leerBloque(li));
        else saltarCampo(li, c.tipo);
      });
      if (contenido && (!mejor || idioma.toLowerCase().startsWith('es'))) mejor = contenido;
    } else {
      saltarCampo(l, campo.tipo);
    }
  });
  return mejor;
}

function leerSelector(buf: Buffer, destino: AlertaParseada): void {
  recorrer(buf, (campo, l) => {
    if (campo.numero === 2 && campo.tipo === TIPO_BLOQUE) {
      destino.routeIds.push(texto(leerBloque(l)));
    } else if (campo.numero === 4 && campo.tipo === TIPO_BLOQUE) {
      const viaje = leerBloque(l);
      recorrer(viaje, (c, lv) => {
        if (c.numero === 1 && c.tipo === TIPO_BLOQUE) destino.tripIds.push(texto(leerBloque(lv)));
        else if (c.numero === 2 && c.tipo === TIPO_BLOQUE)
          destino.routeIds.push(texto(leerBloque(lv)));
        else saltarCampo(lv, c.tipo);
      });
    } else if (campo.numero === 5 && campo.tipo === TIPO_BLOQUE) {
      destino.stopIds.push(texto(leerBloque(l)));
    } else {
      saltarCampo(l, campo.tipo);
    }
  });
}

function leerPeriodo(buf: Buffer): Periodo {
  const periodo: Periodo = { inicio: null, fin: null };
  recorrer(buf, (campo, l) => {
    if (campo.tipo !== TIPO_VARINT) {
      saltarCampo(l, campo.tipo);
      return;
    }
    const valor = Number(leerVarint(l));
    if (campo.numero === 1) periodo.inicio = valor;
    else if (campo.numero === 2) periodo.fin = valor;
  });
  return periodo;
}

/** Devuelve null si el mensaje no contiene ningún campo reconocible de Alert. */
function parsearAlerta(buf: Buffer): AlertaParseada | null {
  const alerta: AlertaParseada = {
    periodos: [],
    stopIds: [],
    routeIds: [],
    tripIds: [],
    causa: null,
    efecto: null,
    titulo: null,
    mensaje: null,
  };
  let reconocido = false;

  recorrer(buf, (campo, l) => {
    if (campo.numero === 1 && campo.tipo === TIPO_BLOQUE) {
      alerta.periodos.push(leerPeriodo(leerBloque(l)));
      reconocido = true;
    } else if (campo.numero === 5 && campo.tipo === TIPO_BLOQUE) {
      leerSelector(leerBloque(l), alerta);
      reconocido = true;
    } else if (campo.numero === 6 && campo.tipo === TIPO_VARINT) {
      alerta.causa = Number(leerVarint(l));
      reconocido = true;
    } else if (campo.numero === 7 && campo.tipo === TIPO_VARINT) {
      alerta.efecto = Number(leerVarint(l));
      reconocido = true;
    } else if (campo.numero === 10 && campo.tipo === TIPO_BLOQUE) {
      alerta.titulo = traducir(leerBloque(l));
      reconocido = true;
    } else if (campo.numero === 11 && campo.tipo === TIPO_BLOQUE) {
      alerta.mensaje = traducir(leerBloque(l));
      reconocido = true;
    } else {
      if (CAMPOS_ALERTA_CONOCIDOS.has(campo.numero)) reconocido = true;
      saltarCampo(l, campo.tipo);
    }
  });

  return reconocido ? alerta : null;
}

function parsearEntidad(buf: Buffer): AlertaGtfsRt | null {
  let id = '';
  let borrada = false;
  let alerta: AlertaParseada | null = null;

  recorrer(buf, (campo, l) => {
    if (campo.numero === 1 && campo.tipo === TIPO_BLOQUE) {
      id = texto(leerBloque(l));
    } else if (campo.numero === 2 && campo.tipo === TIPO_VARINT) {
      borrada = leerVarint(l) !== 0n;
    } else if ((campo.numero === 3 || campo.numero === 5) && campo.tipo === TIPO_BLOQUE) {
      const posibleAlerta = leerBloque(l);
      if (!alerta) alerta = parsearAlerta(posibleAlerta);
    } else {
      saltarCampo(l, campo.tipo);
    }
  });

  if (borrada || !id || !alerta) return null;
  return construirAlerta(id, alerta);
}

function construirAlerta(id: string, alerta: AlertaParseada): AlertaGtfsRt {
  const inicios = alerta.periodos
    .map((p) => p.inicio)
    .filter((v): v is number => typeof v === 'number');
  const fines = alerta.periodos.map((p) => p.fin);
  // Períodos abiertos (sin `end`): el aviso no caduca, `hasta` queda a null
  const hayAbierto = alerta.periodos.length > 0 && fines.some((v) => v === null);
  const cerrados = fines.filter((v): v is number => typeof v === 'number');

  const etiquetas = [
    alerta.causa !== null ? CAUSAS[alerta.causa] : null,
    alerta.efecto !== null ? EFECTOS[alerta.efecto] : null,
  ].filter((v): v is string => Boolean(v));

  return {
    id,
    titulo: alerta.titulo,
    mensaje: alerta.mensaje,
    causa: etiquetas.length > 0 ? etiquetas.join(' · ') : null,
    desde: inicios.length > 0 ? new Date(Math.min(...inicios) * 1000) : null,
    hasta: !hayAbierto && cerrados.length > 0 ? new Date(Math.max(...cerrados) * 1000) : null,
    stopIds: [...new Set(alerta.stopIds)],
    routeIds: [...new Set(alerta.routeIds)],
    tripIds: [...new Set(alerta.tripIds)],
  };
}

/** Decodifica un `alerts.pb` (FeedMessage GTFS-RT) en alertas legibles. */
export function parsearAlertasGtfsRt(datos: Buffer): AlertaGtfsRt[] {
  const alertas: AlertaGtfsRt[] = [];
  recorrer(datos, (campo, l) => {
    if (campo.numero !== 2 || campo.tipo !== TIPO_BLOQUE) {
      saltarCampo(l, campo.tipo);
      return;
    }
    // El bloque se lee FUERA del try: si la longitud del cuerpo no cuadra el
    // feed está cortado y queremos fallar entero (así no desactivamos nada)
    const cuerpo = leerBloque(l);
    try {
      const entidad = parsearEntidad(cuerpo);
      if (entidad) alertas.push(entidad);
    } catch {
      // Una entidad ilegible se ignora; el resto del feed sigue siendo válido
    }
  });
  return alertas;
}

/**
 * Título de respaldo cuando el feed no trae `header_text` (Renfe no lo envía):
 * la primera frase del mensaje, sin hashtags y con un tope de 90 caracteres.
 */
export function resumirTitulo(textoMensaje: string | null): string | null {
  if (!textoMensaje) return null;
  const limpio = textoMensaje.trim().replace(/^#+[^\s]+\s*/, '');
  if (!limpio) return null;
  const frase = /^.{0,90}?[.!?\n]/.exec(limpio)?.[0] ?? limpio.slice(0, 90);
  return frase.trim().replace(/[.!?\s]+$/, '') || null;
}

/**
 * Descarga el feed con timeout; lanza si la respuesta no es 2xx. Caché corta
 * (20 s) con single-flight: los barridos que se solapen comparten el buffer.
 */
export async function descargarAlertasGtfsRt(url: string, timeoutMs = 10_000): Promise<Buffer> {
  return conCache(CACHE_ALERTAS, url, TTL_ALERTAS_MS, async () => {
    const respuesta = await fetch(url, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: { accept: 'application/octet-stream' },
    });
    if (!respuesta.ok) throw new Error(`GTFS_RT_ALERTAS_HTTP_${respuesta.status}`);
    return Buffer.from(await respuesta.arrayBuffer());
  });
}

/** Solo para tests: la caché vive en la memoria del proceso. */
export function limpiarCacheAlertasGtfsRt(): void {
  CACHE_ALERTAS.clear();
}
