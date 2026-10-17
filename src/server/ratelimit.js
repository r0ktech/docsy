import 'server-only';
import { Prisma } from '@prisma/client';
import { prisma } from '@/server/db';

const UTC_NOW = Prisma.raw(`(now() AT TIME ZONE 'UTC')`);
import { Errors } from '@/server/errors';

/**
 * Fixed-window rate limiter backed by Postgres, so limits hold across
 * serverless instances. A single atomic upsert increments the counter or
 * starts a new window.
 */
export async function rateLimit(key, { limit, windowSeconds }) {
  const rows = await prisma.$queryRaw`
    INSERT INTO "RateLimit" ("key", "count", "windowStart")
    VALUES (${key}, 1, ${UTC_NOW})
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE
        WHEN "RateLimit"."windowStart" < ${UTC_NOW} - make_interval(secs => ${windowSeconds}) THEN 1
        ELSE "RateLimit"."count" + 1 END,
      "windowStart" = CASE
        WHEN "RateLimit"."windowStart" < ${UTC_NOW} - make_interval(secs => ${windowSeconds}) THEN ${UTC_NOW}
        ELSE "RateLimit"."windowStart" END
    RETURNING "count", "windowStart"`;
  const { count, windowStart } = rows[0];
  if (count > limit) {
    const retryAfter = Math.max(
      1,
      Math.ceil((new Date(windowStart).getTime() + windowSeconds * 1000 - Date.now()) / 1000),
    );
    throw Errors.rateLimited(retryAfter);
  }
  return { remaining: limit - count };
}

export const LIMITS = {
  signIn: { limit: 10, windowSeconds: 15 * 60 },
  signUp: { limit: 5, windowSeconds: 60 * 60 },
  passwordReset: { limit: 5, windowSeconds: 60 * 60 },
  question: { limit: 20, windowSeconds: 60 },
  upload: { limit: 40, windowSeconds: 10 * 60 },
  mutation: { limit: 120, windowSeconds: 60 },
};
