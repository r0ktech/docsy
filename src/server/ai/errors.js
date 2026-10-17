/** Normalised AI-provider failures with user-safe messages. */
export class AiError extends Error {
  constructor(code, message, { retryable = false, status = 503, cause } = {}) {
    super(message, { cause });
    this.name = 'AiError';
    this.code = code;
    this.retryable = retryable;
    this.status = status;
  }
}

export const AiErrors = {
  notConfigured: (what) =>
    new AiError(
      'AI_NOT_CONFIGURED',
      `The ${what} provider is not configured on this deployment. An administrator needs to add its API key.`,
    ),
  mockBlocked: () =>
    new AiError('AI_NOT_CONFIGURED', 'The mock AI provider is disabled in production. Configure a real provider.'),
  rateLimited: (cause) =>
    new AiError('AI_RATE_LIMITED', 'The AI provider is rate-limiting requests right now. Please try again in a minute.', {
      retryable: true,
      status: 503,
      cause,
    }),
  auth: (cause) =>
    new AiError('AI_AUTH_FAILED', 'The AI provider rejected the configured credentials.', { cause }),
  unavailable: (cause) =>
    new AiError('AI_UNAVAILABLE', 'The AI provider is unavailable right now. Please try again shortly.', {
      retryable: true,
      cause,
    }),
  badRequest: (cause) =>
    new AiError('AI_REQUEST_FAILED', 'The AI provider could not process this request.', { cause, status: 502 }),
  refused: () =>
    new AiError('AI_REFUSED', 'The model declined to answer this request.', { status: 422 }),
};

/** Maps an HTTP status from any provider to an AiError. */
export function aiErrorFromStatus(status, cause) {
  if (status === 401 || status === 403) return AiErrors.auth(cause);
  if (status === 429) return AiErrors.rateLimited(cause);
  if (status >= 500 || status === 408 || status === 409) return AiErrors.unavailable(cause);
  return AiErrors.badRequest(cause);
}
