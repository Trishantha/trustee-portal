/**
 * Database Configuration
 * Prisma Client setup with connection pooling
 */

import { PrismaClient } from '@prisma/client';
import { Logger } from '../utils/logger';

// Prisma client singleton
const globalForPrisma = global as unknown as { prisma: PrismaClient };

export const prisma = globalForPrisma.prisma || new PrismaClient({
  log: process.env.NODE_ENV === 'development' 
    ? ['query', 'info', 'warn', 'error']
    : ['error'],
});

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

// Connection management
export async function connectDatabase(): Promise<void> {
  try {
    await prisma.$connect();
    Logger.info('✅ Database connected successfully');
  } catch (error) {
    Logger.error('❌ Database connection failed', error as Error);
    throw error;
  }
}

export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect();
  Logger.info('Database disconnected');
}

// Health check
export async function checkDatabaseHealth(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

export default prisma;
