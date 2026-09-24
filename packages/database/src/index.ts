import { PrismaClient } from '@prisma/client';

export { PrismaClient };
export * from '@prisma/client';

let cliente: PrismaClient | undefined;

export function getPrisma(): PrismaClient {
  if (!cliente) {
    cliente = new PrismaClient();
  }
  return cliente;
}
