import 'server-only';
import OpenAI from 'openai';
import { getConfig, EMBEDDING_DIMENSIONS, DEFAULT_EMBEDDING_MODELS, isMockAllowed } from '@/server/config';
import { AiError, AiErrors, aiErrorFromStatus } from '@/server/ai/errors';
import { mockEmbed } from '@/server/ai/mock';

const BATCH_SIZE = 64;

export function embeddingModel(config = getConfig()) {
  return config.EMBEDDING_MODEL || DEFAULT_EMBEDDING_MODELS[config.EMBEDDING_PROVIDER];
}

/**
 * Embeds texts with the configured provider. `inputType` lets providers that
 * distinguish queries from documents (Voyage) optimise each side.
 * Returns { vectors: number[][], model, tokens }.
 */
export async function embedTexts(texts, { inputType = 'document' } = {}) {
  const config = getConfig();
  const model = embeddingModel(config);
  const vectors = [];
  let tokens = 0;
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    const result = await withRetry(() => embedBatch(config, model, batch, inputType));
    vectors.push(...result.vectors);
    tokens += result.tokens;
  }
  for (const v of vectors) {
    if (!Array.isArray(v) || v.length !== EMBEDDING_DIMENSIONS) {
      throw new AiError('AI_BAD_RESPONSE', `Embedding provider returned vectors of the wrong size (expected ${EMBEDDING_DIMENSIONS}).`);
    }
  }
  return { vectors, model, tokens };
}

export async function embedQuery(text) {
  const { vectors, model, tokens } = await embedTexts([text], { inputType: 'query' });
  return { vector: vectors[0], model, tokens };
}

async function embedBatch(config, model, input, inputType) {
  switch (config.EMBEDDING_PROVIDER) {
    case 'openai': {
      if (!config.OPENAI_API_KEY) throw AiErrors.notConfigured('embedding');
      const client = new OpenAI({ apiKey: config.OPENAI_API_KEY, baseURL: config.OPENAI_BASE_URL, maxRetries: 0 });
      try {
        const res = await client.embeddings.create({ model, input, dimensions: EMBEDDING_DIMENSIONS });
        return { vectors: res.data.sort((a, b) => a.index - b.index).map((d) => d.embedding), tokens: res.usage?.total_tokens ?? 0 };
      } catch (err) {
        throw mapOpenAiError(err);
      }
    }
    case 'voyage': {
      if (!config.VOYAGE_API_KEY) throw AiErrors.notConfigured('embedding');
      let res;
      try {
        res = await fetch('https://api.voyageai.com/v1/embeddings', {
          method: 'POST',
          headers: { Authorization: `Bearer ${config.VOYAGE_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model, input, input_type: inputType, output_dimension: EMBEDDING_DIMENSIONS }),
        });
      } catch (err) {
        throw AiErrors.unavailable(err);
      }
      if (!res.ok) throw aiErrorFromStatus(res.status, new Error(`Voyage ${res.status}`));
      const body = await res.json();
      return { vectors: body.data.sort((a, b) => a.index - b.index).map((d) => d.embedding), tokens: body.usage?.total_tokens ?? 0 };
    }
    case 'mock': {
      if (!isMockAllowed(config)) throw AiErrors.mockBlocked();
      return { vectors: input.map(mockEmbed), tokens: input.reduce((n, t) => n + Math.ceil(t.length / 4), 0) };
    }
    default:
      throw AiErrors.notConfigured('embedding');
  }
}

export function mapOpenAiError(err) {
  if (err instanceof AiError) return err;
  if (err instanceof OpenAI.APIConnectionError) return AiErrors.unavailable(err);
  if (err instanceof OpenAI.APIError && err.status) return aiErrorFromStatus(err.status, err);
  return AiErrors.unavailable(err);
}

/** Retries transient failures with exponential backoff and jitter. */
export async function withRetry(fn, { attempts = 3, baseMs = 500 } = {}) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!(err instanceof AiError) || !err.retryable || i === attempts - 1) throw err;
      await new Promise((r) => setTimeout(r, baseMs * 2 ** i + Math.random() * 250));
    }
  }
  throw lastErr;
}
