#!/usr/bin/env node
/**
 * Local development database (no Docker or native Postgres build required).
 *
 * Runs PGlite — Postgres compiled to WebAssembly — with the pgvector extension
 * and exposes it over the Postgres wire protocol so Prisma and any Postgres
 * client can connect as if it were a normal server.
 *
 * This is a convenience for local development and automated tests only.
 * Production should use a managed Postgres with pgvector (Supabase, Neon, RDS…).
 *
 *   npm run db:local                # persistent data in ./.pglite
 *   PGLITE_DATA_DIR=memory:// npm run db:local   # ephemeral
 *   PGLITE_PORT=55433 npm run db:local
 */
import { PGlite } from '@electric-sql/pglite';
import { vector } from '@electric-sql/pglite-pgvector';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';

const port = Number(process.env.PGLITE_PORT || 54329);
const dataDir = process.env.PGLITE_DATA_DIR || './.pglite';

const db = await PGlite.create({
  dataDir: dataDir === 'memory://' ? undefined : dataDir,
  extensions: { vector },
});
await db.exec('CREATE EXTENSION IF NOT EXISTS vector;');

const server = new PGLiteSocketServer({
  db,
  port,
  host: '127.0.0.1',
  maxConnections: Number(process.env.PGLITE_MAX_CONNECTIONS || 10),
});
await server.start();

console.log(`[local-db] PGlite + pgvector listening on postgresql://postgres:postgres@127.0.0.1:${port}/postgres`);
console.log(`[local-db] data dir: ${dataDir}`);

async function shutdown() {
  await server.stop();
  await db.close();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
