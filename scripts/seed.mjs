#!/usr/bin/env node
/**
 * Demo seed: creates (or signs in to) a demo account and uploads the clearly
 * labelled, fictional sample documents in ./samples through the app's real
 * upload API, so they go through the same validation and processing as any
 * user upload. Requires the app to be running.
 *
 *   npm run dev            # in one terminal
 *   npm run db:seed        # in another
 *
 * Env: SEED_URL (default http://localhost:3000), SEED_EMAIL, SEED_PASSWORD
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { PrismaClient } from '@prisma/client';

const BASE = process.env.SEED_URL || 'http://localhost:3000';
const EMAIL = process.env.SEED_EMAIL || 'demo@docsy.local';
const PASSWORD = process.env.SEED_PASSWORD || 'docsy-demo-password';
const SAMPLES = path.resolve('samples');
let cookie = '';

async function call(p, { method = 'GET', body, raw } = {}) {
  const res = await fetch(new URL(p, BASE), {
    method,
    headers: { Origin: BASE, Cookie: cookie, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: raw ?? (body ? JSON.stringify(body) : undefined),
  });
  const set = res.headers.get('set-cookie');
  if (set) cookie = set.split(';')[0];
  const data = (res.headers.get('content-type') || '').includes('json') ? await res.json() : null;
  return { status: res.status, data };
}

const health = await fetch(new URL('/api/health', BASE)).catch(() => null);
if (!health?.ok) {
  console.error(`Docsy isn't reachable at ${BASE}. Start it with "npm run dev" first.`);
  process.exit(1);
}

let r = await call('/api/auth/sign-in', { method: 'POST', body: { email: EMAIL, password: PASSWORD } });
if (r.status !== 200) {
  r = await call('/api/auth/sign-up', { method: 'POST', body: { name: 'Demo Reader', email: EMAIL, password: PASSWORD } });
  if (r.status !== 201) throw new Error(`Could not create demo account: ${JSON.stringify(r.data)}`);
  console.log(`Created demo account ${EMAIL}`);
} else {
  console.log(`Signed in as ${EMAIL}`);
}

const files = fs.readdirSync(SAMPLES).filter((f) => /^sample-.*\.(pdf|docx|txt)$/.test(f));
const ids = [];
for (const file of files) {
  const bytes = fs.readFileSync(path.join(SAMPLES, file));
  const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
  r = await call('/api/uploads', { method: 'POST', body: { filename: file, size: bytes.length, sha256 } });
  if (r.status === 409) {
    console.log(`  ${file}: already uploaded`);
    ids.push(r.data.error.details.documentId);
    continue;
  }
  if (r.status !== 201) throw new Error(`${file}: ${r.data?.error?.message}`);
  const { document, upload } = r.data;
  const put = await fetch(new URL(upload.url, BASE), { method: 'PUT', headers: { Origin: BASE, Cookie: cookie, ...upload.headers }, body: bytes });
  if (!put.ok) throw new Error(`${file}: upload failed (${put.status})`);
  r = await call(`/api/uploads/${document.id}/complete`, { method: 'POST' });
  if (r.status !== 200) throw new Error(`${file}: ${r.data?.error?.message}`);
  ids.push(document.id);
  console.log(`  ${file}: uploaded, processing`);
}

// Label the sample documents so they are never mistaken for real user content.
const prisma = new PrismaClient();
await prisma.document.updateMany({ where: { id: { in: ids } }, data: { isSample: true } });
await prisma.$disconnect();

r = await call('/api/collections');
let collection = r.data.collections.find((c) => c.name === 'Sample documents');
if (!collection) {
  r = await call('/api/collections', { method: 'POST', body: { name: 'Sample documents', description: 'Fictional documents for trying out Docsy.' } });
  collection = r.data.collection;
}
await call(`/api/collections/${collection.id}/documents`, { method: 'POST', body: { documentIds: ids } });

process.stdout.write('Waiting for processing');
for (let i = 0; i < 60; i++) {
  r = await call('/api/documents');
  const docs = r.data.documents.filter((d) => ids.includes(d.id));
  if (docs.every((d) => ['READY', 'FAILED'].includes(d.status))) {
    console.log('\n' + docs.map((d) => `  ${d.filename}: ${d.status}${d.errorMessage ? ` — ${d.errorMessage}` : ''}`).join('\n'));
    break;
  }
  process.stdout.write('.');
  await new Promise((res) => setTimeout(res, 1000));
}
console.log(`\nDone. Sign in at ${BASE}/sign-in with ${EMAIL} / ${PASSWORD}`);
