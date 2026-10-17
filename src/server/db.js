import 'server-only';
import { PrismaClient } from '@prisma/client';

// Reuse one client across hot reloads in development and across invocations
// of a warm serverless instance.
const globalForPrisma = globalThis;

export const prisma =
  globalForPrisma.__docsyPrisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.__docsyPrisma = prisma;
