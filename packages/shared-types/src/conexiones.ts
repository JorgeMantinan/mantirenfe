/**
 * Búsqueda de trayectos con 1 transbordo a partir de horarioTren.
 * Nota: horarioTren guarda cada viaje con su primera y última parada, así que
 * la conexión se establece cuando el destino del primer tren y el origen del
 * segundo son la misma estación (o de la misma ciudad, ver grupos).
 */

// Estaciones de larga/media distancia que sirven de puente dentro de una misma ciudad
const GRUPOS_TRANSBORDO: Record<string, string> = {
  '60000': 'madrid', // Madrid-Puerta de Atocha
  '17000': 'madrid', // Madrid-Chamartín-Clara Campoamor
  '71801': 'barcelona', // Barcelona-Sants
  '71802': 'barcelona', // Barcelona-Passeig de Gràcia
  '79400': 'barcelona', // Barcelona Estació de França
  '04040': 'zaragoza', // Zaragoza Delicias
  '70806': 'zaragoza', // Zaragoza-Portillo
  '70807': 'zaragoza', // Zaragoza-Goya
  '71100': 'zaragoza', // Zaragoza-Miraflores
  '03216': 'valencia', // València-Joaquín Sorolla
  '65000': 'valencia', // València-Estació del Nord
  '13200': 'bilbao', // Bilbao-Intermodal Abando
  '05451': 'bilbao', // Bilbao la Concordia
  '31412': 'acoruna', // A Coruña
  '99143': 'acoruna', // A Coruña-Turístico
};

export function mismoGrupoTransbordo(estacionA: string, estacionB: string): boolean {
  if (estacionA === estacionB) return true;
  const grupo = GRUPOS_TRANSBORDO[estacionA];
  return grupo !== undefined && grupo === GRUPOS_TRANSBORDO[estacionB];
}

export interface TramoHorario {
  numeroTren: string;
  origenNombre: string;
  destinoNombre: string;
  origenEstacionId: string;
  destinoEstacionId: string;
  salida: Date;
  llegada: Date;
  operador: string | null;
}

export interface Conexion {
  primera: TramoHorario;
  segunda: TramoHorario;
  esperaMin: number;
}

export const ESPERA_MINIMA_MIN = 45;
export const ESPERA_MAXIMA_MIN = 240;

/**
 * Cruza salidas de A con llegadas a B buscando la conexión con espera razonable.
 * `salientes` y `entrantes` deben venir ordenados por salida ascendente para que
 * cada tren conserve su conexión de espera más corta.
 */
export function cruzarConexiones(
  salientes: TramoHorario[],
  entrantes: TramoHorario[],
  limite = 10,
): Conexion[] {
  const porSalida = [...entrantes].sort((a, b) => a.salida.getTime() - b.salida.getTime());
  const conexiones: Conexion[] = [];

  for (const primera of salientes) {
    if (conexiones.length >= limite) break;
    for (const segunda of porSalida) {
      if (!mismoGrupoTransbordo(primera.destinoEstacionId, segunda.origenEstacionId)) continue;
      const esperaMs = segunda.salida.getTime() - primera.llegada.getTime();
      if (esperaMs < ESPERA_MINIMA_MIN * 60_000) continue;
      if (esperaMs > ESPERA_MAXIMA_MIN * 60_000) continue;
      conexiones.push({ primera, segunda, esperaMin: Math.round(esperaMs / 60_000) });
      break; // la primera válida es la de menor espera (entrantes ordenados por salida)
    }
  }
  return conexiones;
}
