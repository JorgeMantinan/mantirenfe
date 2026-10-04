import type { PuntualidadTrenResponse } from '@mantirenfe/shared-types';
import { horaDesdeMinutos } from '../common/utilidades';

// Reexportado: la implementación vive en `common/utilidades.ts` (compartida
// con `suprimidos/enriquecer.ts`).
export { horaDesdeMinutos };

/** Fila de `ImpuntualidadTren` dentro del mes consultado. */
export interface ServicioImpuntual {
  tripId: string;
  vehiculoId: string;
  numeroTren: string | null;
  fecha: Date;
  retrasoMaxSeg: number;
}

/** Fila de `ParadaHorario` necesaria para resolver los extremos de un trip. */
export interface FilaParada {
  tripId: string;
  orden: number;
  estacionId: string;
  llegadaMin: number | null;
  salidaMin: number | null;
}

/** Extremos reales de un trip: parada de menor y de mayor `orden`. */
export interface ExtremosTrip {
  origenEstacionId: string;
  destinoEstacionId: string;
  /** Salida programada de la primera parada, en minutos GTFS */
  salidaMin: number | null;
  /** Llegada programada de la última parada, en minutos GTFS */
  llegadaMin: number | null;
}

/** Rango [desde, hasta) del mes pedido (o del mes en curso si no es válido). */
export function rangoMes(mes?: string): { desde: Date; hasta: Date } {
  if (mes && /^\d{4}-\d{2}$/.test(mes)) {
    const anio = Number(mes.slice(0, 4));
    const mesNum = Number(mes.slice(5, 7));
    return {
      desde: new Date(Date.UTC(anio, mesNum - 1, 1)),
      hasta: new Date(Date.UTC(anio, mesNum, 1)),
    };
  }
  const ahora = new Date();
  return {
    desde: new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth(), 1)),
    hasta: new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth() + 1, 1)),
  };
}

/** "HH:MM" → minutos desde medianoche (null si no es una hora válida). */
export function minutosDesdeHora(hora: string | null | undefined): number | null {
  if (!hora) return null;
  const coincidencia = /^(\d{1,2}):(\d{2})$/.exec(hora);
  if (!coincidencia) return null;
  const horas = Number(coincidencia[1]);
  const minutos = Number(coincidencia[2]);
  if (!Number.isFinite(horas) || !Number.isFinite(minutos) || minutos > 59) return null;
  return horas * 60 + minutos;
}

/**
 * Extremos de cada trip a partir de todas sus paradas: la de `orden` mínimo es
 * el origen del viaje y la de `orden` máximo, el destino. Una sola pasada en
 * memoria sobre el único pedido de paradas del mes (sin N+1).
 */
export function extremosPorTrip(paradas: FilaParada[]): Map<string, ExtremosTrip> {
  const porTrip = new Map<string, { primera: FilaParada; ultima: FilaParada }>();
  for (const parada of paradas) {
    const previo = porTrip.get(parada.tripId);
    if (!previo) {
      porTrip.set(parada.tripId, { primera: parada, ultima: parada });
      continue;
    }
    if (parada.orden < previo.primera.orden) previo.primera = parada;
    if (parada.orden > previo.ultima.orden) previo.ultima = parada;
  }
  const extremos = new Map<string, ExtremosTrip>();
  for (const [tripId, { primera, ultima }] of porTrip) {
    extremos.set(tripId, {
      origenEstacionId: primera.estacionId,
      destinoEstacionId: ultima.estacionId,
      salidaMin: primera.salidaMin,
      llegadaMin: ultima.llegadaMin,
    });
  }
  return extremos;
}

/**
 * Clave de agrupación de un servicio: el **eje** origen→destino de su trip.
 * Sin paradas para ese trip no hay eje y se conserva el agrupado por vehículo.
 */
export function claveDeServicio(
  servicio: ServicioImpuntual,
  extremos: Map<string, ExtremosTrip>,
): string {
  const extrema = extremos.get(servicio.tripId);
  return extrema
    ? `eje:${extrema.origenEstacionId}:${extrema.destinoEstacionId}`
    : `veh:${servicio.vehiculoId}`;
}

interface ParHorario {
  salidaMin: number | null;
  llegadaMin: number | null;
  cuenta: number;
}

interface Grupo {
  clave: string;
  extrema: ExtremosTrip | null;
  veces: number;
  sumaRetraso: number;
  maxRetraso: number;
  numeroTren: string | null;
  vehiculos: Map<string, number>;
  pares: Map<string, ParHorario>;
  primeraFecha: string;
}

const SIN_MINUTO = 99_999;

/**
 * Ranking del mes agrupado por eje del servicio (no por vehículo físico).
 *
 * - `vecesImpuntuales`: servicios distintos (trip+fecha), no filas repetidas.
 * - `retrasoMedioSeg`/`retrasoMaxSeg`: AVG/MAX del retraso máximo de cada
 *   servicio del eje.
 * - `numeroTren`: el menor de sus números de tren (representativo).
 * - `salida`/`llegada`: el par (salida, llegada) de extremos **más repetido**
 *   entre los servicios impuntuales del eje; a empate, el más temprano. Así
 *   las dos horas pertenecen al mismo trip y no se mezclan salidas de la
 *   mañana con llegadas de la tarde (los trips de un eje comparten horario).
 * - `origenNombre`/`destinoNombre`: nombres reales de las estaciones del eje.
 * - `fecha`: primer día del mes con servicios impuntuales de ese eje.
 */
export function agruparPorEje(
  filas: ServicioImpuntual[],
  extremos: Map<string, ExtremosTrip>,
  nombres: Map<string, string>,
): PuntualidadTrenResponse[] {
  // (tripId, fecha) es único en la BD, pero el dedupe garantiza el
  // COUNT DISTINCT y deja el peor retraso del día por si llega duplicado.
  const servicios = new Map<string, ServicioImpuntual>();
  for (const fila of filas) {
    const id = `${fila.tripId}|${fila.fecha.toISOString().slice(0, 10)}`;
    const previo = servicios.get(id);
    if (!previo || fila.retrasoMaxSeg > previo.retrasoMaxSeg) servicios.set(id, fila);
  }

  const grupos = new Map<string, Grupo>();
  for (const servicio of servicios.values()) {
    const dia = servicio.fecha.toISOString().slice(0, 10);
    const extrema = extremos.get(servicio.tripId) ?? null;
    const clave = claveDeServicio(servicio, extremos);
    let grupo = grupos.get(clave);
    if (!grupo) {
      grupo = {
        clave,
        extrema,
        veces: 0,
        sumaRetraso: 0,
        maxRetraso: 0,
        numeroTren: null,
        vehiculos: new Map(),
        pares: new Map(),
        primeraFecha: dia,
      };
      grupos.set(clave, grupo);
    }
    grupo.veces += 1;
    grupo.sumaRetraso += servicio.retrasoMaxSeg;
    grupo.maxRetraso = Math.max(grupo.maxRetraso, servicio.retrasoMaxSeg);
    if (
      servicio.numeroTren &&
      (grupo.numeroTren === null || servicio.numeroTren < grupo.numeroTren)
    ) {
      grupo.numeroTren = servicio.numeroTren;
    }
    grupo.vehiculos.set(servicio.vehiculoId, (grupo.vehiculos.get(servicio.vehiculoId) ?? 0) + 1);
    if (dia < grupo.primeraFecha) grupo.primeraFecha = dia;
    if (extrema) {
      const clavePar = `${extrema.salidaMin ?? ''}|${extrema.llegadaMin ?? ''}`;
      const par = grupo.pares.get(clavePar);
      if (par) par.cuenta += 1;
      else
        grupo.pares.set(clavePar, {
          salidaMin: extrema.salidaMin,
          llegadaMin: extrema.llegadaMin,
          cuenta: 1,
        });
    }
  }

  const resultado: PuntualidadTrenResponse[] = [];
  for (const grupo of grupos.values()) {
    const par = mejorPar(grupo.pares);
    resultado.push({
      clave: grupo.clave,
      vehiculoId: mejorVehiculo(grupo.vehiculos),
      numeroTren: grupo.numeroTren,
      vecesImpuntuales: grupo.veces,
      retrasoMedioSeg: Math.round(grupo.sumaRetraso / grupo.veces),
      retrasoMaxSeg: grupo.maxRetraso,
      origenNombre: grupo.extrema ? (nombres.get(grupo.extrema.origenEstacionId) ?? null) : null,
      destinoNombre: grupo.extrema ? (nombres.get(grupo.extrema.destinoEstacionId) ?? null) : null,
      salida: horaDesdeMinutos(par?.salidaMin),
      llegada: horaDesdeMinutos(par?.llegadaMin),
      fecha: grupo.primeraFecha,
    });
  }
  return resultado;
}

/**
 * Llegada estimada = llegada programada + el peor retraso registrado en el mes
 * para ese grupo. Es una estimación orientativa (peor caso), NO una hora
 * oficial: la UI la etiqueta como tal.
 */
export function aplicarLlegadaEstimada(filas: PuntualidadTrenResponse[]): void {
  for (const fila of filas) {
    const minutos = minutosDesdeHora(fila.llegada);
    fila.llegadaEstimada =
      minutos == null ? null : horaDesdeMinutos(minutos + fila.retrasoMaxSeg / 60);
  }
}

function mejorPar(pares: Map<string, ParHorario>): ParHorario | null {
  let mejor: ParHorario | null = null;
  for (const par of pares.values()) {
    if (!mejor || esMejorPar(par, mejor)) mejor = par;
  }
  return mejor;
}

/** Más servicios; a empate, el par más temprano (y con minutos completos). */
function esMejorPar(candidato: ParHorario, actual: ParHorario): boolean {
  if (candidato.cuenta !== actual.cuenta) return candidato.cuenta > actual.cuenta;
  for (const campo of ['salidaMin', 'llegadaMin'] as const) {
    const a = candidato[campo] ?? SIN_MINUTO;
    const b = actual[campo] ?? SIN_MINUTO;
    if (a !== b) return a < b;
  }
  return false;
}

/** Vehículo con más servicios del grupo; a empate, el menor id (determinista). */
function mejorVehiculo(vehiculos: Map<string, number>): string {
  let mejorId = '';
  let mejorCuenta = -1;
  for (const [vehiculoId, cuenta] of vehiculos) {
    if (cuenta > mejorCuenta || (cuenta === mejorCuenta && vehiculoId < mejorId)) {
      mejorId = vehiculoId;
      mejorCuenta = cuenta;
    }
  }
  return mejorId;
}
