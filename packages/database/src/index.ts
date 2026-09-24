import { PrismaClient } from '@prisma/client';

export { PrismaClient };
export * from '@prisma/client';
export * from './estaciones';

let cliente: PrismaClient | undefined;

export function getPrisma(): PrismaClient {
  if (!cliente) {
    cliente = new PrismaClient();
  }
  return cliente;
}
