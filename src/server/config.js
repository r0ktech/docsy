import 'server-only';
import { z } from 'zod';

/**
 * Centralised, validated server configuration.
 *
 * Values are read lazily so `next build` does not require runtime secrets.
 * Optional integrations (Google OAuth, email, AI providers, S3) report whether
 * they are configured instead of failing at import time, so the UI can tell
 * users exactly what is missing rather than pretending a feature works.
 */

const bool = (def) =>
  z
    .enum(['true', 'false', '1', '0', ''])
    .optional()
    .transform((v) => (v === undefined || v === '' ? def : v === 'true' || v === '1'));

const int = (def) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === '' ? def : Number.parseInt(v, 10)))
    .pipe(z.number().int().nonnegative());

const optionalString = z
  .string()
  .optional()
  .transform((v) => (v ? v.trim() : undefined));

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_URL: z.string().url().default('http://localhost:3000'),
  CONTACT_EMAIL: z.string().email().optional().or(z.literal('').transform(() => undefined)),

  // Auth
  GOOGLE_CLIENT_ID: optionalString,
  GOOGLE_CLIENT_SECRET: optionalString,
  SESSION_TTL_DAYS: int(30),

  // Email (password reset). Resend's HTTP API is used when configured.
  RESEND_API_KEY: optionalString,
  EMAIL_FROM: optionalString,

  // Storage
  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  LOCAL_STORAGE_DIR: z.string().default('.storage'),
  S3_BUCKET: optionalString,
  S3_REGION: optionalString,
  S3_ENDPOINT: optionalString,
  S3_ACCESS_KEY_ID: optionalString,
  S3_SECRET_ACCESS_KEY: optionalString,
  S3_FORCE_PATH_STYLE: bool(false),

  // AI
  LLM_PROVIDER: z.enum(['anthropic', 'openai', 'mock']).default('anthropic'),
  LLM_MODEL: optionalString,
  LLM_FAST_MODEL: optionalString,
  LLM_EFFORT: z.enum(['low', 'medium', 'high', 'xhigh', 'max']).default('medium'),
  ANTHROPIC_API_KEY: optionalString,
  OPENAI_API_KEY: optionalString,
  OPENAI_BASE_URL: optionalString,
  EMBEDDING_PROVIDER: z.enum(['openai', 'voyage', 'mock']).default('openai'),
  EMBEDDING_MODEL: optionalString,
  VOYAGE_API_KEY: optionalString,
  // The mock providers are deterministic stand-ins for automated tests. They
  // refuse to run in production unless explicitly allowed.
  ALLOW_MOCK_AI: bool(false),

  // Retrieval
  RETRIEVAL_TOP_K: int(8),
  RETRIEVAL_MIN_SIMILARITY: z
    .string()
    .optional()
    .transform((v) => (v ? Number.parseFloat(v) : 0.2)),
  CONTEXT_TOKEN_BUDGET: int(6000),
  HISTORY_TOKEN_BUDGET: int(1500),

  // Upload & plan limits (free tier)
  MAX_UPLOAD_MB: int(20),
  FREE_MAX_DOCUMENTS: int(25),
  FREE_MAX_STORAGE_MB: int(250),
  FREE_MAX_QUESTIONS_PER_MONTH: int(300),
  MAX_PAGES_PER_DOCUMENT: int(500),

  // Jobs
  CRON_SECRET: optionalString,
  INLINE_JOBS: bool(true),
});

let cached;

export function getConfig() {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid environment configuration: ${issues}`);
  }
  cached = Object.freeze(parsed.data);
  return cached;
}

/** For tests only. */
export function resetConfigCache() {
  cached = undefined;
}

export const EMBEDDING_DIMENSIONS = 1024;

export const DEFAULT_MODELS = {
  anthropic: { chat: 'claude-opus-5-5', fast: 'claude-haiku-5-5' },
  openai: { chat: 'gpt-4.1', fast: 'gpt-4.1-mini' },
  mock: { chat: 'mock-llm', fast: 'mock-llm' },
};

export const DEFAULT_EMBEDDING_MODELS = {
  openai: 'text-embedding-3-small',
  voyage: 'voyage-3.5',
  mock: 'mock-embedding',
};

export function isMockAllowed(config = getConfig()) {
  return config.NODE_ENV !== 'production' || config.ALLOW_MOCK_AI;
}

/** Describes which optional integrations are ready. Never includes secret values. */
export function integrationStatus(config = getConfig()) {
  const llmKey = { anthropic: config.ANTHROPIC_API_KEY, openai: config.OPENAI_API_KEY, mock: 'mock' }[
    config.LLM_PROVIDER
  ];
  const embeddingKey = { openai: config.OPENAI_API_KEY, voyage: config.VOYAGE_API_KEY, mock: 'mock' }[
    config.EMBEDDING_PROVIDER
  ];
  const s3Ready = Boolean(
    config.S3_BUCKET && config.S3_REGION && config.S3_ACCESS_KEY_ID && config.S3_SECRET_ACCESS_KEY,
  );
  return {
    llm: {
      provider: config.LLM_PROVIDER,
      configured:
        Boolean(llmKey) && (config.LLM_PROVIDER !== 'mock' || isMockAllowed(config)),
      mock: config.LLM_PROVIDER === 'mock',
    },
    embeddings: {
      provider: config.EMBEDDING_PROVIDER,
      configured:
        Boolean(embeddingKey) && (config.EMBEDDING_PROVIDER !== 'mock' || isMockAllowed(config)),
      mock: config.EMBEDDING_PROVIDER === 'mock',
    },
    storage: {
      driver: config.STORAGE_DRIVER,
      configured: config.STORAGE_DRIVER === 'local' ? true : s3Ready,
    },
    google: { configured: Boolean(config.GOOGLE_CLIENT_ID && config.GOOGLE_CLIENT_SECRET) },
    email: { configured: Boolean(config.RESEND_API_KEY && config.EMAIL_FROM) },
  };
}
