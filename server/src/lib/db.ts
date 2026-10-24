import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient({
  log: process.env.PRISMA_LOG === '1' ? ['query', 'warn', 'error'] : ['warn', 'error'],
});

/** Fail startup before accepting traffic when MySQL is unavailable. */
export async function connectDatabase(): Promise<void> {
  await prisma.$connect();
  await prisma.$queryRaw`SELECT 1`;
}

/** A credential-safe description for server logs. */
export function databaseErrorSummary(error: unknown): string {
  if (!error || typeof error !== 'object') return 'Unknown database error';
  const value = error as { name?: unknown; code?: unknown; errorCode?: unknown };
  const name = typeof value.name === 'string' ? value.name : 'DatabaseError';
  const code = typeof value.code === 'string' ? value.code : typeof value.errorCode === 'string' ? value.errorCode : null;
  return code ? `${name} (${code})` : name;
}
