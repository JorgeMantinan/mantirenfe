import pino from 'pino';
import { getPrisma } from '@mantirenfe/database';
import { sincronizarEstaciones, sincronizarHorarios } from '../src/processors/sync-gtfs';

async function main() {
  const logger = pino({ level: 'info' });
  const estaciones = await sincronizarEstaciones(logger);
  const horarios = await sincronizarHorarios(logger);
  const prisma = getPrisma();
  const totalEstaciones = await prisma.estacion.count();
  const totalHorarios = await prisma.horarioTren.count();
  console.log(JSON.stringify({ estaciones, horarios, totalEstaciones, totalHorarios }, null, 2));
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
