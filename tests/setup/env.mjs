import { vi } from 'vitest';
import { TEST_DATABASE_URL } from './global-setup.mjs';

// Deterministic, offline configuration: mock AI providers, local storage.
Object.assign(process.env, {
  NODE_ENV: 'test',
  DATABASE_URL: TEST_DATABASE_URL,
  APP_URL: 'http://localhost:3000',
  STORAGE_DRIVER: 'local',
  LOCAL_STORAGE_DIR: '.storage-test',
  LLM_PROVIDER: 'mock',
  EMBEDDING_PROVIDER: 'mock',
  INLINE_JOBS: 'false',
  CRON_SECRET: 'test-cron-secret',
});

// Request-scoped Next.js APIs, replaced with a controllable cookie jar.
const cookieJar = new Map();
const headerBag = new Map([['user-agent', 'vitest'], ['x-forwarded-for', '10.0.0.1']]);
globalThis.__testCookies = cookieJar;
globalThis.__testHeaders = headerBag;

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name) => (cookieJar.has(name) ? { name, value: cookieJar.get(name) } : undefined),
    set: (name, value) => cookieJar.set(name, value),
    delete: (name) => cookieJar.delete(name),
    has: (name) => cookieJar.has(name),
  }),
  headers: async () => ({ get: (name) => headerBag.get(name.toLowerCase()) ?? null }),
}));

vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal()),
  after: () => {},
}));

// React's request-scoped cache() is a no-op outside a React server render.
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, cache: (fn) => fn };
});
