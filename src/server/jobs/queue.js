import 'server-only';
import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '@/server/db';
import { log } from '@/server/log';

/**
 * Durable Postgres-backed job queue.
 *
 *  - One row per logical job (unique dedupeKey): re-enqueueing resets the row
 *    instead of creating duplicates.
 *  - Workers claim jobs atomically with FOR UPDATE SKIP LOCKED, so concurrent
 *    workers (inline `after()` calls, the cron endpoint, a standalone worker)
 *    never process the same job at once.
 *  - Jobs whose worker died (stale lock) are reclaimed after LOCK_TIMEOUT.
 *  - Failures retry with exponential backoff up to maxAttempts.
 */

const LOCK_TIMEOUT_SECONDS = 10 * 60;

// Prisma stores DateTime as UTC in `timestamp without time zone` columns, so raw
// SQL must compare against UTC "now" regardless of the session's TimeZone.
const UTC_NOW = Prisma.raw(`(now() AT TIME ZONE 'UTC')`);
const handlers = new Map();

export function registerJobHandler(type, handler) {
  handlers.set(type, handler);
}

export async function enqueueJob(type, dedupeKey, payload, client = prisma) {
  return client.job.upsert({
    where: { dedupeKey },
    create: { type, dedupeKey, payload },
    update: { status: 'PENDING', attempts: 0, runAt: new Date(), lockedAt: null, lockedBy: null, lastError: null, payload },
  });
}

export async function claimJobs(limit = 2) {
  const worker = randomUUID();
  return prisma.$queryRaw`
    UPDATE "Job" SET status = 'RUNNING', "lockedAt" = ${UTC_NOW}, "lockedBy" = ${worker},
      attempts = attempts + 1, "updatedAt" = ${UTC_NOW}
    WHERE id IN (
      SELECT id FROM "Job"
      WHERE (status = 'PENDING' AND "runAt" <= ${UTC_NOW})
         OR (status = 'RUNNING' AND "lockedAt" < ${UTC_NOW} - make_interval(secs => ${LOCK_TIMEOUT_SECONDS}))
      ORDER BY "runAt"
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING *`;
}

async function runJob(job) {
  const handler = handlers.get(job.type);
  if (!handler) {
    await prisma.job.update({ where: { id: job.id }, data: { status: 'FAILED', lastError: `No handler for ${job.type}` } });
    return;
  }
  try {
    await handler(job.payload, { attempt: job.attempts, maxAttempts: job.maxAttempts, isFinalAttempt: job.attempts >= job.maxAttempts });
    // Only mark success if nobody re-enqueued the job while it ran.
    await prisma.job.updateMany({ where: { id: job.id, lockedBy: job.lockedBy }, data: { status: 'SUCCEEDED', lockedAt: null } });
  } catch (err) {
    const retry = err?.retryable !== false && job.attempts < job.maxAttempts;
    const delaySeconds = 15 * 2 ** (job.attempts - 1);
    log.warn('Job failed', { type: job.type, id: job.id, attempt: job.attempts, retry, err });
    await prisma.job.updateMany({
      where: { id: job.id, lockedBy: job.lockedBy },
      data: {
        status: retry ? 'PENDING' : 'FAILED',
        runAt: retry ? new Date(Date.now() + delaySeconds * 1000) : undefined,
        lockedAt: null,
        lastError: String(err?.message || err).slice(0, 1000),
      },
    });
  }
}

/** Processes due jobs until none remain or the time budget is spent. */
export async function runPendingJobs({ timeBudgetMs = 50_000, batchSize = 2 } = {}) {
  const deadline = Date.now() + timeBudgetMs;
  let processed = 0;
  while (Date.now() < deadline) {
    const jobs = await claimJobs(batchSize);
    if (jobs.length === 0) break;
    await Promise.all(jobs.map(runJob));
    processed += jobs.length;
  }
  return { processed };
}
