import { NextResponse } from 'next/server';
import { prisma } from '@/server/db';
import { integrationStatus } from '@/server/config';

export const dynamic = 'force-dynamic';

/** Liveness + configuration check. Reports what is configured, never secret values. */
export async function GET() {
  let database = 'ok';
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    database = 'unavailable';
  }
  const integrations = integrationStatus();
  return NextResponse.json(
    { status: database === 'ok' ? 'ok' : 'degraded', database, integrations },
    { status: database === 'ok' ? 200 : 503 },
  );
}
