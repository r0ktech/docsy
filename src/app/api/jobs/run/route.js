import { NextResponse } from 'next/server';
import { getConfig } from '@/server/config';
import { safeEqual } from '@/server/crypto';
import { runPendingJobs } from '@/server/jobs';
import { errorResponse } from '@/server/http';

export const maxDuration = 60;

/**
 * Job runner endpoint for Vercel Cron (GET) or an external scheduler / the
 * local worker script (POST). Requires `Authorization: Bearer $CRON_SECRET`.
 */
async function handle(request) {
  try {
    const secret = getConfig().CRON_SECRET;
    const header = request.headers.get('authorization') || '';
    if (!secret || !safeEqual(header, `Bearer ${secret}`)) {
      return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: 'Invalid cron secret.' } }, { status: 401 });
    }
    const result = await runPendingJobs({ timeBudgetMs: 50_000 });
    return NextResponse.json(result);
  } catch (err) {
    return errorResponse(err, request);
  }
}

export const GET = handle;
export const POST = handle;
