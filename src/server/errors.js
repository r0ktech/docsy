/**
 * Application errors carry a stable machine-readable `code`, an HTTP status,
 * and a message that is safe to show to users. Anything that is not an
 * AppError is treated as an internal error and its details are never exposed.
 */
export class AppError extends Error {
  constructor(code, message, { status = 400, details, cause } = {}) {
    super(message, { cause });
    this.name = 'AppError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export const Errors = {
  unauthorized: (msg = 'Please sign in to continue.') => new AppError('UNAUTHORIZED', msg, { status: 401 }),
  forbidden: (msg = 'You do not have access to this resource.') => new AppError('FORBIDDEN', msg, { status: 403 }),
  // Resources owned by other users are reported as "not found" so their existence is not revealed.
  notFound: (what = 'Resource') => new AppError('NOT_FOUND', `${what} not found.`, { status: 404 }),
  validation: (msg, details) => new AppError('VALIDATION_ERROR', msg, { status: 422, details }),
  conflict: (code, msg, details) => new AppError(code, msg, { status: 409, details }),
  limit: (code, msg, details) => new AppError(code, msg, { status: 402, details }),
  rateLimited: (retryAfterSeconds) =>
    new AppError('RATE_LIMITED', 'Too many requests. Please wait a moment and try again.', {
      status: 429,
      details: { retryAfterSeconds },
    }),
  unavailable: (code, msg) => new AppError(code, msg, { status: 503 }),
};

export function isAppError(err) {
  return err instanceof AppError;
}
