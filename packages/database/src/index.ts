import { PrismaClient } from '@prisma/client';

export { PrismaClient };
export * from '@prisma/client';
export * from './estaciones';

let cliente: PrismaClient | undefined;

export function getPrisma(): PrismaClient {
  if (!cliente) {
    // DATABASE_URL_APP: rol restringido (solo DML) para la app en runtime.
    // Las migraciones (prisma db push) siguen usando DATABASE_URL (postgres),
    // que sí necesita permisos de DDL.
    const urlApp = process.env.DATABASE_URL_APP;
    cliente = new PrismaClient(urlApp ? { datasources: { db: { url: urlApp } } } : undefined);
  }
  return cliente;
}
