import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { rmSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { vector } from '@electric-sql/pglite-pgvector';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';

export const TEST_DB_PORT = 54339;
export const TEST_DATABASE_URL = `postgresql://postgres:postgres@127.0.0.1:${TEST_DB_PORT}/postgres?sslmode=disable&connection_limit=5&pgbouncer=true`;

/**
 * Starts an in-memory Postgres (PGlite + pgvector) for the test run and
 * applies the real migrations, so integration tests exercise the same SQL —
 * vector search, full-text search, cascades — as production.
 */
export default async function setup() {
  const db = await PGlite.create({ extensions: { vector } });
  await db.exec('CREATE EXTENSION IF NOT EXISTS vector;');
  const server = new PGLiteSocketServer({ db, port: TEST_DB_PORT, host: '127.0.0.1', maxConnections: 10 });
  await server.start();
  // Async on purpose: the PGlite server runs on this process's event loop.
  await promisify(exec)('npx prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
  });
  return async () => {
    await server.stop();
    await db.close();
    rmSync('.storage-test', { recursive: true, force: true });
  };
}
