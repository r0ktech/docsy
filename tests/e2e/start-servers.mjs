/**
 * Starts an in-memory PGlite database, applies migrations, then runs the app
 * against it with mock AI providers and a throwaway storage directory.
 */
import { spawn, exec } from 'node:child_process';
import { promisify } from 'node:util';
import { rmSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { vector } from '@electric-sql/pglite-pgvector';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';

const port = Number(process.env.E2E_PORT || 3100);
const dbPort = 54349;
const DATABASE_URL = `postgresql://postgres:postgres@127.0.0.1:${dbPort}/postgres?sslmode=disable&connection_limit=5&pgbouncer=true`;

const db = await PGlite.create({ extensions: { vector } });
await db.exec('CREATE EXTENSION IF NOT EXISTS vector;');
const server = new PGLiteSocketServer({ db, port: dbPort, host: '127.0.0.1', maxConnections: 10 });
await server.start();
await promisify(exec)('npx prisma migrate deploy', { env: { ...process.env, DATABASE_URL } });
rmSync('.storage-e2e', { recursive: true, force: true });

const app = spawn('npx', ['next', 'dev', '-p', String(port)], {
  stdio: 'inherit',
  env: {
    ...process.env,
    DATABASE_URL,
    APP_URL: `http://localhost:${port}`,
    NEXT_DIST_DIR: '.next-e2e',
    STORAGE_DRIVER: 'local',
    LOCAL_STORAGE_DIR: '.storage-e2e',
    LLM_PROVIDER: 'mock',
    EMBEDDING_PROVIDER: 'mock',
    INLINE_JOBS: 'true',
    CRON_SECRET: 'e2e-secret',
    GOOGLE_CLIENT_ID: '',
    GOOGLE_CLIENT_SECRET: '',
  },
});

const stop = async () => {
  app.kill('SIGTERM');
  await server.stop();
  await db.close();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
app.on('exit', stop);
