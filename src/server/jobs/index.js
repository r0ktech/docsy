import 'server-only';
import { after } from 'next/server';
import { getConfig } from '@/server/config';
import { log } from '@/server/log';
import { runPendingJobs } from '@/server/jobs/queue';
// Importing the pipeline registers its job handler.
import '@/server/processing/pipeline';

export { runPendingJobs };

/**
 * Starts processing queued jobs after the current response has been sent
 * (Next.js `after`). On Vercel this runs within the function's max duration;
 * the cron endpoint (/api/jobs/run) picks up anything left over, including
 * retries scheduled for later.
 */
export function kickJobs() {
  if (!getConfig().INLINE_JOBS) return;
  after(async () => {
    try {
      await runPendingJobs({ timeBudgetMs: 45_000 });
    } catch (err) {
      log.error('Inline job run failed', { err });
    }
  });
}
