import type { Logger } from 'pino';
import { getPrisma } from '@mantirenfe/database';

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

export async function sincronizarEstaciones(logger: Logger): Promise<number> {
  const url =
    process.env.GTFS_STOPS_URL ?? 'https://data.renfe.com/opendata/GTFS-Cercanias/stops.txt';

  const controlador = new AbortController();
  const timeout = setTimeout(() => controlador.abort(), 30_000);

  try {
    const respuesta = await fetch(url, { signal: controlador.signal });
    if (!respuesta.ok) {
      throw new Error(`GTFS_STOPS_HTTP_${respuesta.status}`);
    }
    const contenido = await respuesta.text();
    const filas = parsearCsv(contenido);
    const prisma = getPrisma();
    let count = 0;

    for (const fila of filas) {
      const codigo = fila.stop_id ?? fila.stop_code;
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
      count++;
    }

    logger.info({ count }, 'Estaciones GTFS sincronizadas');
    return count;
  } finally {
    clearTimeout(timeout);
  }
}
