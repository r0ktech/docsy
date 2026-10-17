import 'server-only';

/**
 * Minimal structured logger. Writes JSON lines in production (easy to ingest
 * in Vercel / Datadog) and readable lines in development. Never pass secrets.
 */
const isProd = process.env.NODE_ENV === 'production';

function write(level, msg, meta) {
  if (process.env.NODE_ENV === 'test' && level !== 'error' && !process.env.DEBUG_LOGS) return;
  const entry = { level, msg, ...serialize(meta), time: new Date().toISOString() };
  const line = isProd ? JSON.stringify(entry) : `[${level}] ${msg}${meta ? ' ' + JSON.stringify(serialize(meta)) : ''}`;
  (level === 'error' ? console.error : level === 'warn' ? console.warn : console.log)(line);
}

function serialize(meta) {
  if (!meta) return {};
  const out = {};
  for (const [k, v] of Object.entries(meta)) {
    out[k] = v instanceof Error ? { name: v.name, message: v.message, code: v.code, stack: isProd ? undefined : v.stack } : v;
  }
  return out;
}

export const log = {
  info: (msg, meta) => write('info', msg, meta),
  warn: (msg, meta) => write('warn', msg, meta),
  error: (msg, meta) => write('error', msg, meta),
};
