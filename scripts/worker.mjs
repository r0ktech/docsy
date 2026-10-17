#!/usr/bin/env node
/**
 * Polls the job endpoint so queued work (including scheduled retries) is
 * processed outside of request lifecycles — useful for local development with
 * INLINE_JOBS=false, or self-hosting without a cron service.
 *
 *   CRON_SECRET=... npm run jobs:work
 */
const BASE = process.env.APP_URL || 'http://localhost:3000';
const SECRET = process.env.CRON_SECRET;
const INTERVAL = Number(process.env.WORKER_INTERVAL_MS || 5000);
if (!SECRET) {
  console.error('Set CRON_SECRET (the same value the app uses).');
  process.exit(1);
}
console.log(`[worker] polling ${BASE}/api/jobs/run every ${INTERVAL / 1000}s`);
for (;;) {
  try {
    const res = await fetch(`${BASE}/api/jobs/run`, { method: 'POST', headers: { Authorization: `Bearer ${SECRET}` } });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) console.warn(`[worker] ${res.status}`, body.error?.message || '');
    else if (body.processed) console.log(`[worker] processed ${body.processed} job(s)`);
  } catch (err) {
    console.warn('[worker] app unreachable:', err.message);
  }
  await new Promise((r) => setTimeout(r, INTERVAL));
}
