/**
 * Motor puro de itinerarios con escala (1 transbordo) para trenes.
 *
 * El módulo se parte en dos:
 *  - `componerItinerarios`: 100% pura, cruza horarios y paradas en memoria.
 *  - `cargarDatosItinerario`: único punto con BD (Prisma), con queries acotadas.
 *
 * Unidades: todos los campos `*Min` son minutos peninsulares desde medianoche
 * del día de servicio GTFS. Pueden superar 1440 en servicios que acaban tras la
 * medianoche (p. ej. 1500 = 01:00 del día siguiente). Las `Date` de
 * `HorarioTren` codifican la hora peninsular como UTC (18:57 local = 18:57Z),
 * por lo que se leen con getUTCHours/getUTCMinutes y nunca con los métodos
 * locales (dependen de la zona horaria de la máquina).
 */

import type { PrismaClient } from '@mantirenfe/database';

/** Espera mínima por defecto en la estación de enlace (minutos peninsulares). */
export const ENLACE_MIN_DEFECTO = 20;

/** Nº máximo de itinerarios devueltos por defecto. */
export const MAX_RESULTADOS_DEFECTO = 20;

/** Cota de filas de `HorarioTren` que trae `cargarDatosItinerario`. */
export const LIMITE_HORARIOS = 5000;

/** Cota de filas de `ParadaHorario` que trae `cargarDatosItinerario`. */
export const LIMITE_PARADAS = 50_000;

/** Un tramo de un itinerario: un tren concreto entre dos estaciones. */
export interface TramoItinerario {
  /** Número de tren (código GTFS), sin la hora de circulación. */
  numeroTren: string;
  /**
   * Trip GTFS del tramo. Si la fila de horario no traía `tripId` se usa el
   * `numeroTren` como identificador (los directos no necesitan cruzar paradas).
   */
  tripId: string;
  /** Estación donde se sube: el origen del viaje o la estación de enlace. */
  estacionOrigenId: string;
  /** Estación donde se baja: la estación de enlace o el destino final. */
  estacionDestinoId: string;
  /** Minutos peninsulares de salida (>= 1440 si el servicio cruza la medianoche). */
  salidaMin: number;
  /** Minutos peninsulares de llegada (>= 1440 si el servicio cruza la medianoche). */
  llegadaMin: number;
}

/** Itinerario completo: 1 tramo (directo) o 2 tramos con 1 enlace (escala). */
export interface Itinerario {
  tipo: 'directo' | 'escala';
  /** 1 tramo si es directo; exactamente 2 si es escala. */
  tramos: TramoItinerario[];
  /** Espera en la estación de enlace; siempre 0 en los directos. */
  esperaMin: number;
  /** Minutos peninsulares de llegada al destino final. */
  llegadaTotalMin: number;
}

/**
 * Fila de `HorarioTren` (extremos del viaje: 1 fila por trip + fecha).
 * `salida`/`llegada` son Date con la hora peninsular codificada como UTC.
 */
export interface EntradaHorario {
  tripId: string | null;
  numeroTren: string;
  salida: Date;
  llegada: Date;
  origenEstacionId: string;
  destinoEstacionId: string;
}

/**
 * Fila de `ParadaHorario` (parada de un trip, sin fecha: se cruza por tripId con
 * los trips del día). `llegadaMin`/`salidaMin` son minutos desde medianoche del
 * día de servicio y pueden superar 1440; `null` cuando GTFS no informa el dato
 * (p. ej. la salida en el origen del viaje).
 */
export interface EntradaParada {
  tripId: string;
  estacionId: string;
  orden: number;
  llegadaMin: number | null;
  salidaMin: number | null;
}

/** Opciones de `componerItinerarios`. Todo el cruce se resuelve en memoria. */
export interface OpcionesItinerarios {
  /** Horarios del día (directos y piernas candidatas a escala). */
  horarios: EntradaHorario[];
  /** Paradas de los trips presentes en `horarios`. */
  paradas: EntradaParada[];
  /** Estación de salida del itinerario. */
  origenId: string;
  /** Estación de llegada del itinerario. */
  destinoId: string;
  /** Espera mínima en el enlace. Por defecto {@link ENLACE_MIN_DEFECTO} (20). */
  enlaceMin?: number;
  /** Minutos peninsulares mínimos de salida del primer tramo (sin límite). */
  franjaDesdeMin?: number;
  /** Minutos peninsulares máximos de llegada al destino (sin límite). */
  franjaHastaMin?: number;
  /** Nº máximo de itinerarios. Por defecto {@link MAX_RESULTADOS_DEFECTO} (20). */
  maxResultados?: number;
}

/**
 * Resultado de `cargarDatosItinerario`: horarios, paradas útiles y el listado de
 * estaciones de enlace (X) candidatas que devuelve el propio cargador.
 */
export interface DatosItinerario {
  horarios: EntradaHorario[];
  paradas: EntradaParada[];
  /** Estaciones de enlace candidatas (≠ origen y ≠ destino), ordenadas. */
  estacionesEnlace: string[];
}

/**
 * Minutos peninsulares de una `Date` de `HorarioTren`: la hora local está
 * codificada como UTC, así que se leen los campos UTC.
 */
function minutosPeninsulares(fecha: Date): number {
  return fecha.getUTCHours() * 60 + fecha.getUTCMinutes();
}

/**
 * Comprueba la franja horaria opcional sobre la salida del primer tramo y la
 * llegada total. Un límite no definido no restringe nada.
 */
function enFranja(
  salidaPrimerTramo: number,
  llegadaTotal: number,
  franjaDesdeMin?: number,
  franjaHastaMin?: number,
): boolean {
  if (franjaDesdeMin !== undefined && salidaPrimerTramo < franjaDesdeMin) return false;
  if (franjaHastaMin !== undefined && llegadaTotal > franjaHastaMin) return false;
  return true;
}

/** Trip localizado dentro de los índices de paradas. */
interface Viaje {
  tripId: string;
  numeroTren: string;
  /** Paradas ordenadas por `orden` ascendente. */
  paradas: EntradaParada[];
  /** Primera parada de cada estación del trip (accesos O(1)). */
  porEstacion: Map<string, EntradaParada>;
}

/**
 * Indexa paradas por trip y por estación, descartando los trips sin fila de
 * horario (no habría `numeroTren` con el que construir el tramo).
 */
function indexarViajes(
  horarios: EntradaHorario[],
  paradas: EntradaParada[],
): { viajes: Viaje[]; viajesPorEstacion: Map<string, Viaje[]> } {
  const numeroTrenPorTrip = new Map<string, string>();
  for (const h of horarios) {
    if (h.tripId !== null) numeroTrenPorTrip.set(h.tripId, h.numeroTren);
  }

  const paradasPorTrip = new Map<string, EntradaParada[]>();
  for (const p of paradas) {
    const lista = paradasPorTrip.get(p.tripId);
    if (lista) lista.push(p);
    else paradasPorTrip.set(p.tripId, [p]);
  }

  const viajes: Viaje[] = [];
  const viajesPorEstacion = new Map<string, Viaje[]>();
  for (const [tripId, crudas] of paradasPorTrip) {
    const numeroTren = numeroTrenPorTrip.get(tripId);
    if (numeroTren === undefined) continue;
    const ordenadas = [...crudas].sort((a, b) => a.orden - b.orden);
    const porEstacion = new Map<string, EntradaParada>();
    for (const p of ordenadas) {
      if (!porEstacion.has(p.estacionId)) porEstacion.set(p.estacionId, p);
    }
    const viaje: Viaje = { tripId, numeroTren, paradas: ordenadas, porEstacion };
    viajes.push(viaje);
    for (const estacionId of porEstacion.keys()) {
      const lista = viajesPorEstacion.get(estacionId);
      if (lista) lista.push(viaje);
      else viajesPorEstacion.set(estacionId, [viaje]);
    }
  }
  return { viajes, viajesPorEstacion };
}

/** Directos primero; dentro de cada tipo, por llegada y, en empate, por espera. */
function comparar(a: Itinerario, b: Itinerario): number {
  if (a.tipo !== b.tipo) return a.tipo === 'directo' ? -1 : 1;
  if (a.llegadaTotalMin !== b.llegadaTotalMin) return a.llegadaTotalMin - b.llegadaTotalMin;
  return a.esperaMin - b.esperaMin;
}

/** Clave de dedupe: el trip en los directos y la pareja [tripA, tripB] en las escalas. */
function claveDedupe(it: Itinerario): string {
  const primero = it.tramos[0]?.tripId ?? '';
  if (it.tipo === 'directo') return `directo|${primero}`;
  return `escala|${primero}|${it.tramos[1]?.tripId ?? ''}`;
}

/**
 * Compone itinerarios directos y con 1 escala a partir de horarios y paradas.
 *
 * Reglas:
 *  - **Directo**: fila de horario con `origenEstacionId === origenId` y
 *    `destinoEstacionId === destinoId`; tramo único cuyos minutos salen de los
 *    Date (hora peninsular codificada como UTC).
 *  - **Escala (1 enlace)**: pierna A que pasa por el ORIGEN con `salidaMin` no
 *    nulo y sigue hasta una estación X; pierna B que sale de X y llega al
 *    DESTINO con `llegadaMin` no nulo. Se exige
 *    `salidaB(X) >= llegadaA(X) + enlaceMin`. X ≠ origenId y X ≠ destinoId, y X
 *    debe aparecer en las paradas de ambos trips (mismo día de servicio: los
 *    datos ya vienen del día). Si A no informa `llegadaMin` en X se usa su
 *    `salidaMin` en X (espera 0 en esa parada): el propio `enlaceMin` sigue
 *    cubriendo el tiempo mínimo de correspondencia.
 *  - **Franja**: con `franjaDesdeMin`/`franjaHastaMin` definidos, la salida del
 *    primer tramo debe ser >= que la primera y la llegada total <= que la segunda.
 *
 * Orden: directos primero (llegada ascendente) y luego escalas (llegada
 * ascendente; en empate, menor espera). Dedupe por trip en los directos y por
 * pareja [tripA, tripB] en las escalas (se conserva el mejor candidato tras la
 * ordenación); después se corta en `maxResultados`.
 *
 * Función pura: no consulta la BD ni muta las entradas.
 *
 * @param opts Ver {@link OpcionesItinerarios}.
 * @returns Itinerarios ordenados, como mucho `maxResultados`.
 */
export function componerItinerarios(opts: OpcionesItinerarios): Itinerario[] {
  const {
    horarios,
    paradas,
    origenId,
    destinoId,
    enlaceMin = ENLACE_MIN_DEFECTO,
    franjaDesdeMin,
    franjaHastaMin,
    maxResultados = MAX_RESULTADOS_DEFECTO,
  } = opts;
  const limite = Math.max(0, maxResultados);
  if (limite === 0) return [];

  const candidatos: Itinerario[] = [];

  // --- Directos: extremos coincidentes, minutos leídos de los Date (UTC). ---
  for (const h of horarios) {
    if (h.origenEstacionId !== origenId || h.destinoEstacionId !== destinoId) continue;
    const salidaMin = minutosPeninsulares(h.salida);
    const llegadaMin = minutosPeninsulares(h.llegada);
    if (!enFranja(salidaMin, llegadaMin, franjaDesdeMin, franjaHastaMin)) continue;
    candidatos.push({
      tipo: 'directo',
      tramos: [
        {
          numeroTren: h.numeroTren,
          // Sin tripId no hay cruce posible con paradas; para identificar y
          // deduplicar el directo basta el numeroTren.
          tripId: h.tripId ?? h.numeroTren,
          estacionOrigenId: origenId,
          estacionDestinoId: destinoId,
          salidaMin,
          llegadaMin,
        },
      ],
      esperaMin: 0,
      llegadaTotalMin: llegadaMin,
    });
  }

  // --- Escalas: A lleva de ORIGEN a X, B lleva de X a DESTINO. ---
  const { viajes, viajesPorEstacion } = indexarViajes(horarios, paradas);
  for (const viajeA of viajes) {
    const paradaOrigenA = viajeA.porEstacion.get(origenId);
    if (!paradaOrigenA || paradaOrigenA.salidaMin === null) continue;

    for (const paradaA of viajeA.paradas) {
      if (paradaA.orden <= paradaOrigenA.orden) continue;
      const estacionEnlace = paradaA.estacionId;
      if (estacionEnlace === origenId || estacionEnlace === destinoId) continue;
      // Sin llegada documentada en X se usa la salida de A en X (espera 0).
      const llegadaAEnEnlace = paradaA.llegadaMin ?? paradaA.salidaMin;
      if (llegadaAEnEnlace === null) continue;

      const posiblesB = viajesPorEstacion.get(estacionEnlace);
      if (!posiblesB) continue;

      for (const viajeB of posiblesB) {
        if (viajeB.tripId === viajeA.tripId) continue;
        const paradaDestinoB = viajeB.porEstacion.get(destinoId);
        if (!paradaDestinoB || paradaDestinoB.llegadaMin === null) continue;
        const paradaEnlaceB = viajeB.porEstacion.get(estacionEnlace);
        if (!paradaEnlaceB || paradaEnlaceB.salidaMin === null) continue;
        // B tiene que salir de X antes de llegar al destino.
        if (paradaEnlaceB.orden >= paradaDestinoB.orden) continue;

        const esperaMin = paradaEnlaceB.salidaMin - llegadaAEnEnlace;
        if (esperaMin < enlaceMin) continue;

        const llegadaTotalMin = paradaDestinoB.llegadaMin;
        const salidaPrimerTramo = paradaOrigenA.salidaMin;
        if (!enFranja(salidaPrimerTramo, llegadaTotalMin, franjaDesdeMin, franjaHastaMin)) {
          continue;
        }

        candidatos.push({
          tipo: 'escala',
          tramos: [
            {
              numeroTren: viajeA.numeroTren,
              tripId: viajeA.tripId,
              estacionOrigenId: origenId,
              estacionDestinoId: estacionEnlace,
              salidaMin: salidaPrimerTramo,
              llegadaMin: llegadaAEnEnlace,
            },
            {
              numeroTren: viajeB.numeroTren,
              tripId: viajeB.tripId,
              estacionOrigenId: estacionEnlace,
              estacionDestinoId: destinoId,
              salidaMin: paradaEnlaceB.salidaMin,
              llegadaMin: llegadaTotalMin,
            },
          ],
          esperaMin,
          llegadaTotalMin,
        });
      }
    }
  }

  candidatos.sort(comparar);

  const resultado: Itinerario[] = [];
  const vistos = new Set<string>();
  for (const it of candidatos) {
    const clave = claveDedupe(it);
    if (vistos.has(clave)) continue;
    vistos.add(clave);
    resultado.push(it);
    if (resultado.length >= limite) break;
  }
  return resultado;
}

/**
 * Carga desde la BD los datos que necesita `componerItinerarios` para una fecha.
 *
 * Queries (ambas acotadas):
 *  1. `HorarioTren` del día con `origen = origenId` o `destino = destinoId`
 *     (`take` {@link LIMITE_HORARIOS}, select mínimo, ordenado por salida).
 *  2. `ParadaHorario` solo de esos tripIds (`take` {@link LIMITE_PARADAS},
 *     select mínimo, ordenado por tripId + orden).
 *
 * De las paradas se devuelven únicamente las de `estacionId` en
 * `{origenId, destinoId}` ∪ intersección de estaciones entre los trips que pasan
 * por el ORIGEN y los que pasan por el DESTINO. Esa intersección son las
 * estaciones de enlace (X) que pueden dar lugar a una escala, y de paso se
 * conservan todas las paradas de subida en ORIGEN y de bajada en DESTINO; el
 * resto se descarta en memoria para no devolver decenas de miles de filas inútiles.
 *
 * @param prisma Cliente Prisma (p. ej. `getPrisma()` de `@mantirenfe/database`).
 * @param opts `origenId`, `destinoId` y `fechaIso` (`YYYY-MM-DD`, día peninsular).
 * @returns Horarios, paradas filtradas y `estacionesEnlace` candidatas (ordenadas).
 */
export async function cargarDatosItinerario(
  prisma: PrismaClient,
  opts: { origenId: string; destinoId: string; fechaIso: string },
): Promise<DatosItinerario> {
  const { origenId, destinoId, fechaIso } = opts;
  const fecha = new Date(`${fechaIso}T00:00:00Z`);

  const filasHorario = await prisma.horarioTren.findMany({
    where: {
      fecha,
      OR: [{ origenEstacionId: origenId }, { destinoEstacionId: destinoId }],
    },
    orderBy: { salida: 'asc' },
    take: LIMITE_HORARIOS,
    select: {
      tripId: true,
      numeroTren: true,
      salida: true,
      llegada: true,
      origenEstacionId: true,
      destinoEstacionId: true,
    },
  });
  const horarios: EntradaHorario[] = filasHorario;

  const tripIds = [
    ...new Set(
      filasHorario.map((h) => h.tripId).filter((tripId): tripId is string => tripId !== null),
    ),
  ];

  const filasParada =
    tripIds.length === 0
      ? []
      : await prisma.paradaHorario.findMany({
          where: { tripId: { in: tripIds } },
          orderBy: [{ tripId: 'asc' }, { orden: 'asc' }],
          take: LIMITE_PARADAS,
          select: {
            tripId: true,
            estacionId: true,
            orden: true,
            llegadaMin: true,
            salidaMin: true,
          },
        });

  // 1) Qué trips pasan por el ORIGEN y qué trips pasan por el DESTINO.
  const viajesPorOrigen = new Set<string>();
  const viajesPorDestino = new Set<string>();
  for (const p of filasParada) {
    if (p.estacionId === origenId) viajesPorOrigen.add(p.tripId);
    if (p.estacionId === destinoId) viajesPorDestino.add(p.tripId);
  }

  // 2) Estaciones alcanzables desde el ORIGEN y alcanzables hasta el DESTINO.
  const estacionesDesdeOrigen = new Set<string>();
  const estacionesHastaDestino = new Set<string>();
  for (const p of filasParada) {
    if (viajesPorOrigen.has(p.tripId)) estacionesDesdeOrigen.add(p.estacionId);
    if (viajesPorDestino.has(p.tripId)) estacionesHastaDestino.add(p.estacionId);
  }

  // 3) Intersección = estaciones que sirven de enlace candidato.
  const estacionesEnlace = [...estacionesDesdeOrigen]
    .filter((id) => estacionesHastaDestino.has(id) && id !== origenId && id !== destinoId)
    .sort();
  const relevantes = new Set<string>([origenId, destinoId, ...estacionesEnlace]);

  const paradas: EntradaParada[] = [];
  for (const p of filasParada) {
    if (!relevantes.has(p.estacionId)) continue;
    paradas.push({
      tripId: p.tripId,
      estacionId: p.estacionId,
      orden: p.orden,
      llegadaMin: p.llegadaMin,
      salidaMin: p.salidaMin,
    });
  }

  return { horarios, paradas, estacionesEnlace };
}
