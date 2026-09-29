import path from 'node:path';
import dotenv from 'dotenv';
import pino from 'pino';
import { getPrisma } from '@mantirenfe/database';
import {
  fuentesGtfs,
  filasDeFeed,
  repararTripIdsDesactualizados,
} from '../src/processors/sync-gtfs';

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

/**
 * Backfill único: repara `HorarioTren.tripId` contra los feeds PUBLICADOS AHORA.
 *
 * Por qué: el feed AV/LD regenera los tripId con la fecha de alta
 * (`0019012026-09-24` → `0019012026-09-29`) y el sync los guarda con
 * `createMany(skipDuplicates)`: la unique `[numeroTren, fecha, origen, salida]`
 * salta la fila nueva y la BD conserva el tripId viejo, que ya no existe en
 * `ParadaHorario` → `GET /trenes/horarios` (fallback) y `GET /trenes/estacion`
 * devuelven 0 para rutas con paradas intermedias (A Coruña→Vilagarcía, Arcade).
 *
 * Qué hace: para cada feed principal, calcula las filas que el sync insertaría
 * (`filasDeFeed`, MISMO parser) y actualiza el tripId de las filas cuya clave
 * única coincide pero cuyo tripId ya no es el del feed
 * (`repararTripIdsDesactualizados`, el mismo mecanismo que corre en cada sync).
 *
 * Qué NO toca: `ParadaHorario`, `ImpuntualidadTren` ni `Cancelacion`.
 * Solo actualiza: no borra, no inserta.
 *
 * Uso:  pnpm --filter @mantirenfe/worker db:backfill-tripids
 *       (o: npx tsx scripts/backfill-tripids.ts desde apps/worker)
 */

/** Filas por lote: mismo tamaño que los lotes del sync. */
const TAM_LOTE = 500;
/** Días hacia delante de la ventana de horarios (idéntico al sync). */
const DIAS_VENTANA = 45;
/** Días hacia atrás de la ventana de horarios (idéntico al sync). */
const DIAS_HISTORICO = 7;

const RE_LD = /[0-9]{4}-[0-9]{2}-[0-9]{2}$/;

interface Recuento {
  tripsHorario: number;
  sinCruce: number;
  sinCruceLd: number;
}

/**
 * TripIds distintos de `HorarioTren` que NO existen en `ParadaHorario`: son
 * exactamente los cruces rotos (la query que usa `trayectosPorParadas` y
 * `salidasEstacion`). Se hace en memoria: un `NOT EXISTS` sobre 181k filas se
 * pasa del statement timeout del pooler.
 */
async function contarSinCruce(prisma: ReturnType<typeof getPrisma>): Promise<Recuento> {
  const horario = await prisma.$queryRawUnsafe<Array<{ tripId: string }>>(
    'SELECT DISTINCT "tripId" FROM "HorarioTren" WHERE "tripId" IS NOT NULL',
  );
  const paradas = await prisma.$queryRawUnsafe<Array<{ tripId: string }>>(
    'SELECT DISTINCT "tripId" FROM "ParadaHorario"',
  );
  const enParadas = new Set(paradas.map((p) => p.tripId));
  const fuera = horario.map((h) => h.tripId).filter((t) => !enParadas.has(t));
  return {
    tripsHorario: horario.length,
    sinCruce: fuera.length,
    sinCruceLd: fuera.filter((t) => RE_LD.test(t) && !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(t))
      .length,
  };
}

async function main() {
  const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' });
  const prisma = getPrisma();

  const hoy = new Date();
  hoy.setUTCHours(0, 0, 0, 0);
  const desde = new Date(hoy);
  desde.setUTCDate(desde.getUTCDate() - DIAS_HISTORICO);
  const hasta = new Date(hoy);
  hasta.setUTCDate(hasta.getUTCDate() + Number(process.env.GTFS_DIAS_VENTANA ?? DIAS_VENTANA));

  // Mismo mapa código → id que resuelve el sync antes de volcar (incluye el
  // filtro de FK: el origen/destino deben existir en Estacion).
  const estaciones = new Map(
    (
      await prisma.estacion.findMany({
        select: { id: true, codigo: true },
      })
    ).map((e) => [e.codigo, e.id]),
  );

  const antes = await contarSinCruce(prisma);
  console.log('ANTES  ', antes);

  // Solo los feeds principales: los secundarios (OUIGO) se añaden con
  // operador y su configuración no es la habitual en local.
  const feeds = fuentesGtfs().filter((f) => !f.operador);
  let actualizadas = 0;
  for (const fuente of feeds) {
    const inicio = Date.now();
    const filas = await filasDeFeed(fuente.url, logger, desde, hasta, estaciones);
    // Todos los tripIds vigentes del feed: evita que la reparación reescriba
    // viajes gemelos que el feed sigue publicando (oscilaban 358 filas/pasada).
    const tripIdsPublicados = new Set(filas.map((f) => f.tripId));
    let reparadasFeed = 0;
    let msLectura = 0;
    const inicioLotes = Date.now();
    for (let i = 0, lote = 0; i < filas.length; i += TAM_LOTE, lote++) {
      const t = Date.now();
      const reparadas = await repararTripIdsDesactualizados(
        prisma,
        filas.slice(i, i + TAM_LOTE),
        tripIdsPublicados,
      );
      const ms = Date.now() - t;
      msLectura += ms;
      reparadasFeed += reparadas;
      if (reparadas > 0 || lote % 25 === 0) {
        console.log(`  lote ${lote} (${i}/${filas.length}): ${reparadas} updates, ${ms} ms`);
      }
    }
    actualizadas += reparadasFeed;
    console.log(
      `feed ${fuente.url}: ${filas.length} filas evaluadas, ` +
        `${reparadasFeed} tripIds actualizados ` +
        `(${Date.now() - inicioLotes} ms en lotes, ${msLectura} ms de BD, ` +
        `${Date.now() - inicio} ms de feed)`,
    );
  }

  const despues = await contarSinCruce(prisma);
  console.log('DESPUÉS', despues);
  console.log(`tripIds actualizados en total: ${actualizadas}`);

  await prisma.$disconnect();

  if (despues.sinCruce > 0) {
    console.log(
      `Quedan ${despues.sinCruce} tripIds distintos sin cruce: son huérfanos cuya ` +
        'programación ya no está en el feed (fechas anteriores a la publicación ' +
        'actual) y no tienen sustituto posible. El recuento es por tripId ' +
        'distinto, no por filas.',
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
