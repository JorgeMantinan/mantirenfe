import type { HorarioTrenResponse } from '@mantirenfe/shared-types';

export interface EstacionBuscada {
  id: string;
  nombre: string;
}

interface FilaHorarioDia {
  tripId: string | null;
  numeroTren: string;
  operador: string | null;
}

interface FilaParada {
  tripId: string;
  estacionId: string;
  orden: number;
  llegadaMin: number | null;
  salidaMin: number | null;
}

/** Pedidos mínimos a la BD (Prisma en producción, un doble en los tests). */
export interface BaseParadas {
  horarioTren: {
    findMany: (args: {
      where: { fecha: Date };
      select: { tripId: true; numeroTren: true; operador: true };
      /** Red de seguridad: los viajes de un día (medido: 6.512) van muy por debajo */
      take?: number;
    }) => Promise<FilaHorarioDia[]>;
  };
  paradaHorario: {
    findMany: (args: {
      where: { estacionId: { in: string[] }; tripId: { in: string[] } };
      select: {
        tripId: true;
        estacionId: true;
        orden: true;
        llegadaMin: true;
        salidaMin: true;
      };
      /** Red de seguridad: el filtro por estación + viajes del día mantiene
       *  cada pedido por debajo de ~5.300 filas medidas (Madrid completo) */
      take?: number;
    }) => Promise<FilaParada[]>;
  };
}

/**
 * Techo de filas por pedido: por encima de él se corta (nunca se carga todo
 * sin límite). Las medidas reales quedan muy por debajo, así que el corte no
 * llega a producirse en condiciones normales.
 */
const LIMITE_FILAS = 20_000;

interface OpcionesTrayectos {
  /** Fecha de la consulta (YYYY-MM-DD), la misma que usa HorarioTren.fecha */
  fecha: string;
  origenes: EstacionBuscada[];
  destinos: EstacionBuscada[];
  /** Máximo de trenes devueltos (50 = límite de la búsqueda de horarios) */
  limite?: number;
}

/**
 * Trayectos cuyo origen y destino NO son los extremos del viaje (p. ej.
 * A Coruña → Vilagarcía en un tren que sigue a Vigo).
 *
 * `HorarioTren` solo materializa la primera y última parada de cada trip, así
 * que esos trayectos no aparecen ni en la búsqueda directa ni en la de
 * transbordos. Aquí se recomponen con `ParadaHorario` (todas las paradas del
 * feed, sin fecha) restringido a los trips que operan ese día:
 *
 * 1. `HorarioTren.fecha` da los viajes del día (una fila por trip + fecha, con
 *    su número de tren y operador). Sin tabla de calendario nueva.
 * 2. Paradas del origen en esos viajes → p1 (salida).
 * 3. Paradas del destino en esos mismos viajes → p2, la primera que viene
 *    DESPUÉS de p1 (mismo viaje, `orden` mayor).
 *
 * Los minutos GTFS se convierten a fecha real como (fecha del viaje + minutos),
 * igual que construye sus filas `HorarioTren`.
 *
 * Coste medido (BD real): 6.512 viajes/día → paradas de origen ≤ 5.315 filas
 * (estación más transitada) y de destino ≤ 30 sobre esos viajes. Todos los
 * pedidos van con `select` mínimo y `take` de red de seguridad: ninguno
 * materializa las 1,67 M filas de `ParadaHorario`.
 */
export async function trayectosPorParadas(
  base: BaseParadas,
  { fecha, origenes, destinos, limite = 50 }: OpcionesTrayectos,
): Promise<HorarioTrenResponse[]> {
  if (origenes.length === 0 || destinos.length === 0) return [];

  const delDia = await base.horarioTren.findMany({
    where: { fecha: new Date(`${fecha}T00:00:00Z`) },
    select: { tripId: true, numeroTren: true, operador: true },
    take: LIMITE_FILAS,
  });
  const porTrip = new Map<string, { numeroTren: string; operador: string | null }>();
  for (const horario of delDia) {
    // Las filas antiguas (sin tripId) no permiten cruzar con ParadaHorario
    if (horario.tripId && !porTrip.has(horario.tripId)) {
      porTrip.set(horario.tripId, {
        numeroTren: horario.numeroTren,
        operador: horario.operador,
      });
    }
  }
  if (porTrip.size === 0) return [];
  const tripIds = [...porTrip.keys()];

  const paradasOrigen = await base.paradaHorario.findMany({
    where: {
      estacionId: { in: origenes.map((e) => e.id) },
      tripId: { in: tripIds },
    },
    select: { tripId: true, estacionId: true, orden: true, llegadaMin: true, salidaMin: true },
    take: LIMITE_FILAS,
  });

  // Mejor parada de origen por viaje: la salida más temprana (una estación
  // puede aparecer repetida si la búsqueda coincide con varias estaciones)
  const viajes = new Map<string, FilaParada>();
  for (const parada of paradasOrigen) {
    if (parada.salidaMin === null) continue;
    const previa = viajes.get(parada.tripId);
    if (!previa || parada.salidaMin < (previa.salidaMin ?? Infinity)) {
      viajes.set(parada.tripId, parada);
    }
  }
  if (viajes.size === 0) return [];

  const paradasDestino = await base.paradaHorario.findMany({
    where: {
      estacionId: { in: destinos.map((e) => e.id) },
      tripId: { in: [...viajes.keys()] },
    },
    select: { tripId: true, estacionId: true, orden: true, llegadaMin: true, salidaMin: true },
    take: LIMITE_FILAS,
  });

  // Primer destino del viaje que viene después de la parada de origen
  const destinosPorViaje = new Map<string, FilaParada>();
  for (const parada of paradasDestino) {
    if (parada.llegadaMin === null) continue;
    const origen = viajes.get(parada.tripId);
    if (!origen || parada.orden <= origen.orden) continue;
    const previo = destinosPorViaje.get(parada.tripId);
    if (!previo || parada.orden < previo.orden) destinosPorViaje.set(parada.tripId, parada);
  }

  const nombreOrigen = new Map(origenes.map((e) => [e.id, e.nombre]));
  const nombreDestino = new Map(destinos.map((e) => [e.id, e.nombre]));
  const [ano, mes, dia] = fecha.split('-').map(Number);
  if (ano === undefined || mes === undefined || dia === undefined) return [];
  const baseMs = Date.UTC(ano, mes - 1, dia);

  const resultados: HorarioTrenResponse[] = [];
  for (const [tripId, origen] of viajes) {
    const destino = destinosPorViaje.get(tripId);
    if (!destino || origen.salidaMin === null || destino.llegadaMin === null) continue;
    const meta = porTrip.get(tripId);
    if (!meta) continue;
    const salidaMs = baseMs + origen.salidaMin * 60_000;
    const llegadaMs = baseMs + destino.llegadaMin * 60_000;
    resultados.push({
      numeroTren: meta.numeroTren,
      origenNombre: nombreOrigen.get(origen.estacionId) ?? origen.estacionId,
      destinoNombre: nombreDestino.get(destino.estacionId) ?? destino.estacionId,
      salida: new Date(salidaMs).toISOString(),
      llegada: new Date(llegadaMs).toISOString(),
      duracionMin: Math.max(1, Math.round((llegadaMs - salidaMs) / 60_000)),
      operador: meta.operador,
    });
  }

  resultados.sort((a, b) => a.salida.localeCompare(b.salida));
  return resultados.slice(0, limite);
}
