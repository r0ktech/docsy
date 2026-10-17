import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { prisma } from '@/server/db';
import { registerUser } from '@/server/services/auth';
import { createSession, sessionCookieName } from '@/server/auth/session';
import { createUpload, completeUpload } from '@/server/services/documents';
import { getStorage } from '@/server/storage';
import { processDocument } from '@/server/processing/pipeline';

export const SAMPLES = path.resolve('samples');
export const sample = (name) => path.join(SAMPLES, name);

export async function resetDb() {
  const tables = await prisma.$queryRaw`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(', ')} CASCADE`);
  globalThis.__testCookies.clear();
}

let counter = 0;
export async function createUser(overrides = {}) {
  counter += 1;
  return registerUser({
    name: overrides.name ?? `Test User ${counter}`,
    email: overrides.email ?? `user${counter}-${Date.now()}@example.com`,
    password: overrides.password ?? 'a very long password',
  });
}

/** Makes subsequent route calls authenticate as `user`. */
export async function signInAs(user) {
  globalThis.__testCookies.clear();
  if (user) await createSession(user.id);
}

export function sessionToken() {
  return globalThis.__testCookies.get(sessionCookieName());
}

/** Full upload pipeline through the real services: reserve → store → verify → process. */
export async function uploadFile(user, filePath, { process = true, filename } = {}) {
  const bytes = fs.readFileSync(filePath);
  const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
  const fullUser = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
  const { document } = await createUpload(fullUser, { filename: filename ?? path.basename(filePath), size: bytes.length, sha256 });
  const record = await prisma.document.findUniqueOrThrow({ where: { id: document.id } });
  await getStorage().putObject(record.storageKey, bytes, record.mimeType);
  await completeUpload(user.id, document.id);
  if (process) await processDocument(document.id);
  return prisma.document.findUniqueOrThrow({ where: { id: document.id } });
}

export function jsonRequest(url, { method = 'GET', body, origin = 'http://localhost:3000', headers = {} } = {}) {
  return new Request(`http://localhost:3000${url}`, {
    method,
    headers: { ...(origin ? { Origin: origin } : {}), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

export const ctx = (params = {}) => ({ params: Promise.resolve(params) });

export async function readSse(response) {
  const text = await response.text();
  return text
    .split('\n\n')
    .map((block) => ({
      event: block.match(/^event: (.*)$/m)?.[1],
      data: block.match(/^data: (.*)$/m)?.[1],
    }))
    .filter((e) => e.event)
    .map((e) => ({ event: e.event, data: JSON.parse(e.data) }));
}

export async function drain(generator) {
  const events = [];
  for await (const e of generator) events.push(e);
  return events;
}
