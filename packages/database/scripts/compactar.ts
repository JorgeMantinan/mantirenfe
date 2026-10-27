import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';

dotenv.config({ path: '../../.env' });

/**
 * Reclama disco real de Supabase con `VACUUM FULL` (reescribe la tabla y
 * devuelve el espacio al sistema operativo; autovacuum solo lo deja libre
 * DENTRO del fichero, que es lo que cuenta el cuota de 500 MB del plan Free).
 *
 * Uso:  pnpm --filter @mantirenfe/database db:compactar
 *
 * OJO: `VACUUM FULL` toma un bloqueo EXCLUSIVO de la tabla mientras dura
 * (minutos en ParadaHorario): lánzalo con poco tráfico. El momento bueno es
 * DESPUÉS de un sync GTFS que haya recortado filas (p. ej. tras bajar
 * VENTANA_GTFS_DIAS), que es cuando hay espacio que reclamar.
 *
 * Repite cuando `db:io` marque que la BD vuelve a acercarse a los 500 MB.
 */
const TABLAS = ['ParadaHorario', 'HorarioTren'];

async function tamano(prisma: PrismaClient): Promise<string> {
  const filas = await prisma.$queryRawUnsafe<Array<{ tamano: string }>>(
    'SELECT pg_size_pretty(pg_database_size(current_database())) AS tamano',
  );
  return filas[0]?.tamano ?? '?';
}

async function main() {
  const prisma = new PrismaClient();
  const antes = await tamano(prisma);
  console.log(`Tamaño antes: ${antes}`);

  for (const tabla of TABLAS) {
    const inicio = Date.now();
    console.log(`VACUUM FULL de ${tabla}…`);
    await prisma.$executeRawUnsafe(`VACUUM (FULL, ANALYZE) "${tabla}"`);
    console.log(`  ${tabla} listo en ${Math.round((Date.now() - inicio) / 1000)} s`);
  }

  const despues = await tamano(prisma);
  console.log(`Tamaño después: ${despues} (antes: ${antes})`);
  await prisma.$disconnect();

  if (despues === antes) {
    console.log('Sin cambio: no había filas muertas que reclamar todavía.');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
