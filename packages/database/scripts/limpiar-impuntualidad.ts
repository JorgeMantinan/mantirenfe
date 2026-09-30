import path from 'node:path';
import dotenv from 'dotenv';
import { getPrisma } from '../src/index';

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

/**
 * Limpieza puntual del histórico de `ImpuntualidadTren` (artefactos que la
 * sanidad de escritura de `persistirPosiciones` ya no vuelve a crear):
 *
 *  1. `retrasoMaxSeg > 21600` (6 h): delays GTFS-RT de ~24 h por cruces de
 *     medianoche (1.426 min en C4a-27318, 1.074 min en C7-70500...).
 *  2. `numeroTren LIKE '%PLATF%'`: viajes de plataforma/mantenimiento, que no
 *     son servicios de viajeros y nunca deberían contar como impuntuales.
 *
 * Script TEMPORAL (una vez ejecutado, se borra). No toca ningún otro criterio.
 *
 * Uso:  pnpm --filter @mantirenfe/database exec tsx scripts/limpiar-impuntualidad.ts [--dry]
 *       --dry → solo cuenta y pinta muestras, no borra.
 */

const RETRASO_MAX_SEG = 21_600;
const NUMERO_TREN_PLATAFORMA = 'PLATF';
const SOLO_CONTEO = process.argv.includes('--dry');

function minutos(segundos: number): string {
  return `${(segundos / 60).toFixed(0)} min`;
}

async function contar(prisma: ReturnType<typeof getPrisma>): Promise<void> {
  const total = await prisma.impuntualidadTren.count();
  const excesivos = await prisma.impuntualidadTren.count({
    where: { retrasoMaxSeg: { gt: RETRASO_MAX_SEG } },
  });
  const plataforma = await prisma.impuntualidadTren.count({
    where: { numeroTren: { contains: NUMERO_TREN_PLATAFORMA } },
  });
  const plataformaMinusculas = await prisma.$queryRawUnsafe<Array<{ n: bigint }>>(
    `SELECT count(*)::bigint AS n FROM "ImpuntualidadTren"
     WHERE lower("numeroTren") LIKE '%platf%' AND "numeroTren" NOT LIKE '%PLATF%'`,
  );
  console.log(`Total ImpuntualidadTren:            ${total}`);
  console.log(`  retrasoMaxSeg > 6 h:              ${excesivos}`);
  console.log(`  numeroTren LIKE '%PLATF%':        ${plataforma}`);
  console.log(`  (variantes en minúsculas:         ${plataformaMinusculas[0]?.n ?? 0n})`);

  const peores = await prisma.impuntualidadTren.findMany({
    orderBy: { retrasoMaxSeg: 'desc' },
    take: 5,
    select: { tripId: true, numeroTren: true, fecha: true, retrasoMaxSeg: true },
  });
  console.log('Top 5 global:');
  for (const fila of peores) {
    console.log(
      `  ${fila.retrasoMaxSeg} s = ${minutos(fila.retrasoMaxSeg)} | ${fila.numeroTren} | ${fila.tripId} | ${fila.fecha.toISOString().slice(0, 10)}`,
    );
  }
}

async function topSeptiembre(prisma: ReturnType<typeof getPrisma>): Promise<void> {
  const desde = new Date('2026-09-01T00:00:00.000Z');
  const hasta = new Date('2026-10-01T00:00:00.000Z');
  const top = await prisma.impuntualidadTren.findMany({
    where: { fecha: { gte: desde, lt: hasta } },
    orderBy: { retrasoMaxSeg: 'desc' },
    take: 5,
    select: { tripId: true, numeroTren: true, fecha: true, retrasoMaxSeg: true },
  });
  console.log('Top 5 retrasoMaxSeg de septiembre 2026 (después):');
  if (top.length === 0) {
    console.log('  (sin filas)');
    return;
  }
  for (const fila of top) {
    console.log(
      `  ${fila.retrasoMaxSeg} s = ${minutos(fila.retrasoMaxSeg)} | ${fila.numeroTren} | ${fila.tripId} | ${fila.fecha.toISOString().slice(0, 10)}`,
    );
  }
}

async function main(): Promise<void> {
  const prisma = getPrisma();

  console.log('== Antes ==');
  await contar(prisma);

  // 1) Retrasos imposibles (> 6 h)
  const filasExcesivas = await prisma.impuntualidadTren.findMany({
    where: { retrasoMaxSeg: { gt: RETRASO_MAX_SEG } },
    orderBy: { retrasoMaxSeg: 'desc' },
    take: 20,
    select: { tripId: true, numeroTren: true, fecha: true, retrasoMaxSeg: true },
  });
  console.log(`\nMuestras > 6 h (hasta 20 de ${filasExcesivas.length}):`);
  for (const fila of filasExcesivas) {
    console.log(
      `  ${fila.retrasoMaxSeg} s = ${minutos(fila.retrasoMaxSeg)} | ${fila.numeroTren} | ${fila.tripId} | ${fila.fecha.toISOString().slice(0, 10)}`,
    );
  }

  // 2) Viajes de plataforma (se cuentan ANTES de borrar el paso 1 para poder
  //    desglosar solapes; el borrado de >6 h va primero porque es el criterio
  //    más estrecho y así el recuento de PLATF reporta lo que borra él solo)
  const plataformaPrevia = await prisma.impuntualidadTren.count({
    where: { numeroTren: { contains: NUMERO_TREN_PLATAFORMA } },
  });

  if (SOLO_CONTEO) {
    console.log('\n[dry-run] no se borra nada.');
  } else {
    const borradasRetraso = (
      await prisma.impuntualidadTren.deleteMany({
        where: { retrasoMaxSeg: { gt: RETRASO_MAX_SEG } },
      })
    ).count;
    const borradasPlataforma = (
      await prisma.impuntualidadTren.deleteMany({
        where: { numeroTren: { contains: NUMERO_TREN_PLATAFORMA } },
      })
    ).count;
    console.log(`\nBorradas por retrasoMaxSeg > 6 h: ${borradasRetraso}`);
    console.log(
      `Borradas por numeroTren LIKE '%PLATF%' (resto, ya sin solape): ${borradasPlataforma}`,
    );
    console.log(`  PLATF totales antes de borrar: ${plataformaPrevia}`);
  }

  console.log('\n== Después ==');
  await contar(prisma);
  await topSeptiembre(prisma);

  const restantes = await prisma.impuntualidadTren.count({
    where: {
      OR: [
        { retrasoMaxSeg: { gt: RETRASO_MAX_SEG } },
        { numeroTren: { contains: NUMERO_TREN_PLATAFORMA } },
      ],
    },
  });
  console.log(`Restan filas con alguno de los dos artefactos: ${restantes}`);

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
