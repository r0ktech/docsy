import 'server-only';
import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import { AppError, Errors } from '@/server/errors';
import { AiError } from '@/server/ai/errors';
import { getConfig } from '@/server/config';
import { requireUser } from '@/server/auth/session';
import { log } from '@/server/log';

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Wraps a route handler with:
 *  - CSRF defence for cookie-authenticated mutations (Origin must match APP_URL)
 *  - optional authentication (`ctx.user`)
 *  - uniform JSON error responses that never leak internals
 */
export function route(fn, { auth = true, csrf = true } = {}) {
  return async (request, context) => {
    try {
      if (csrf && MUTATING.has(request.method)) assertSameOrigin(request);
      const params = context?.params ? await context.params : {};
      const user = auth ? await requireUser() : null;
      return await fn(request, { params, user });
    } catch (err) {
      return errorResponse(err, request);
    }
  };
}

export function assertSameOrigin(request) {
  const origin = request.headers.get('origin');
  const allowed = new Set([new URL(getConfig().APP_URL).origin, new URL(request.url).origin]);
  // Browsers always send Origin on cross-site POST/PUT/PATCH/DELETE. A missing
  // Origin with a fetch-metadata "cross-site" marker is rejected too.
  if (origin ? !allowed.has(origin) : request.headers.get('sec-fetch-site') === 'cross-site') {
    throw Errors.forbidden('Cross-site request blocked.');
  }
}

export function toAppError(err) {
  if (err instanceof AppError) return err;
  if (err instanceof AiError) return new AppError(err.code, err.message, { status: err.status });
  if (err instanceof ZodError) {
    const first = err.issues[0];
    return Errors.validation(first?.message || 'Invalid request.', {
      fields: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2025') return Errors.notFound();
    if (err.code === 'P2002') return Errors.conflict('ALREADY_EXISTS', 'That already exists.');
  }
  if (
    err instanceof Prisma.PrismaClientInitializationError ||
    (err instanceof Prisma.PrismaClientKnownRequestError && ['P1001', 'P1002', 'P1017', 'P2024'].includes(err.code))
  ) {
    return Errors.unavailable('DATABASE_UNAVAILABLE', 'The database is temporarily unavailable. Please try again shortly.');
  }
  return null;
}

export function errorResponse(err, request) {
  const appErr = toAppError(err);
  if (!appErr) {
    log.error('Unhandled route error', { err, path: request ? new URL(request.url).pathname : undefined });
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Something went wrong on our side. Please try again.' } },
      { status: 500 },
    );
  }
  if (appErr.status >= 500) log.warn('Route error', { code: appErr.code, err });
  const headers = {};
  if (appErr.code === 'RATE_LIMITED' && appErr.details?.retryAfterSeconds) {
    headers['Retry-After'] = String(appErr.details.retryAfterSeconds);
  }
  return NextResponse.json(
    { error: { code: appErr.code, message: appErr.message, details: appErr.details } },
    { status: appErr.status, headers },
  );
}

export async function readJson(request, schema) {
  let body;
  try {
    body = await request.json();
  } catch {
    throw Errors.validation('Request body must be valid JSON.');
  }
  return schema.parse(body);
}

export function json(data, init) {
  return NextResponse.json(data, init);
}
