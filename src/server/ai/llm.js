import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { getConfig, DEFAULT_MODELS, isMockAllowed } from '@/server/config';
import { AiError, AiErrors, aiErrorFromStatus } from '@/server/ai/errors';
import { mapOpenAiError } from '@/server/ai/embeddings';
import { mockAnswer } from '@/server/ai/mock';

/**
 * Provider-agnostic text generation.
 *
 * streamCompletion() is an async generator yielding
 *   { type: 'text', text }   — incremental output
 *   { type: 'done', model, inputTokens, outputTokens, stopReason }
 *
 * complete() returns the full text for short utility tasks (titles, query
 * rewriting, suggested questions) using the configured "fast" model.
 */

export function chatModel(config = getConfig()) {
  return config.LLM_MODEL || DEFAULT_MODELS[config.LLM_PROVIDER].chat;
}

export function fastModel(config = getConfig()) {
  return config.LLM_FAST_MODEL || DEFAULT_MODELS[config.LLM_PROVIDER].fast;
}

export async function* streamCompletion({ system, messages, model, maxTokens = 16000, effort, mockContext }) {
  const config = getConfig();
  const resolvedModel = model || chatModel(config);
  switch (config.LLM_PROVIDER) {
    case 'anthropic':
      yield* streamAnthropic(config, { system, messages, model: resolvedModel, maxTokens, effort: effort || config.LLM_EFFORT });
      return;
    case 'openai':
      yield* streamOpenAi(config, { system, messages, model: resolvedModel, maxTokens });
      return;
    case 'mock':
      yield* streamMock(config, mockContext);
      return;
    default:
      throw AiErrors.notConfigured('language model');
  }
}

export async function complete({ system, prompt, maxTokens = 2000, mockResult = '' }) {
  const config = getConfig();
  let text = '';
  let usage = { inputTokens: 0, outputTokens: 0, model: fastModel(config) };
  const stream =
    config.LLM_PROVIDER === 'mock'
      ? mockStream(config, mockResult)
      : streamCompletion({
          system,
          messages: [{ role: 'user', content: prompt }],
          model: fastModel(config),
          maxTokens,
          effort: 'low',
        });
  for await (const event of stream) {
    if (event.type === 'text') text += event.text;
    else if (event.type === 'done') usage = event;
  }
  return { text: text.trim(), ...usage };
}

// ─── Anthropic ──────────────────────────────────────────────────────────────

// Server-side refusal fallback is available on these model families.
function supportsServerFallback(model) {
  return /^claude-(opus-5|sonnet-5-5|fable-5)/.test(model);
}

async function* streamAnthropic(config, { system, messages, model, maxTokens, effort }) {
  if (!config.ANTHROPIC_API_KEY) throw AiErrors.notConfigured('language model');
  const client = new Anthropic({ apiKey: config.ANTHROPIC_API_KEY, maxRetries: 2 });
  const fallback = supportsServerFallback(model);
  const params = {
    model,
    max_tokens: maxTokens,
    system,
    messages,
    output_config: { effort },
    ...(fallback ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' } : {}),
  };
  try {
    const stream = fallback ? client.beta.messages.stream(params) : client.messages.stream(params);
    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        yield { type: 'text', text: event.delta.text };
      }
    }
    const final = await stream.finalMessage();
    if (final.stop_reason === 'refusal') throw AiErrors.refused();
    yield {
      type: 'done',
      model: final.model || model,
      inputTokens: final.usage?.input_tokens ?? 0,
      outputTokens: final.usage?.output_tokens ?? 0,
      stopReason: final.stop_reason,
    };
  } catch (err) {
    throw mapAnthropicError(err);
  }
}

function mapAnthropicError(err) {
  if (err instanceof AiError) return err;
  if (err instanceof Anthropic.APIConnectionError) return AiErrors.unavailable(err);
  if (err instanceof Anthropic.APIError && err.status) return aiErrorFromStatus(err.status, err);
  return AiErrors.unavailable(err);
}

// ─── OpenAI (and OpenAI-compatible endpoints) ───────────────────────────────

async function* streamOpenAi(config, { system, messages, model, maxTokens }) {
  if (!config.OPENAI_API_KEY) throw AiErrors.notConfigured('language model');
  const client = new OpenAI({ apiKey: config.OPENAI_API_KEY, baseURL: config.OPENAI_BASE_URL, maxRetries: 2 });
  try {
    const stream = await client.chat.completions.create({
      model,
      max_completion_tokens: maxTokens,
      stream: true,
      stream_options: { include_usage: true },
      messages: [{ role: 'system', content: system }, ...messages],
    });
    let usage = null;
    let finish = null;
    for await (const chunk of stream) {
      const delta = chunk.choices?.[0]?.delta?.content;
      if (delta) yield { type: 'text', text: delta };
      if (chunk.choices?.[0]?.finish_reason) finish = chunk.choices[0].finish_reason;
      if (chunk.usage) usage = chunk.usage;
    }
    if (finish === 'content_filter') throw AiErrors.refused();
    yield {
      type: 'done',
      model,
      inputTokens: usage?.prompt_tokens ?? 0,
      outputTokens: usage?.completion_tokens ?? 0,
      stopReason: finish,
    };
  } catch (err) {
    throw mapOpenAiError(err);
  }
}

// ─── Mock (tests) ───────────────────────────────────────────────────────────

async function* streamMock(config, mockContext) {
  const text = mockAnswer(mockContext || { question: '', sources: [] });
  yield* mockStream(config, text);
}

async function* mockStream(config, text) {
  if (!isMockAllowed(config)) throw AiErrors.mockBlocked();
  if (process.env.MOCK_LLM_FAIL === '1') throw AiErrors.unavailable(new Error('mock failure'));
  for (const piece of text.match(/\S+\s*/g) || []) {
    yield { type: 'text', text: piece };
  }
  yield { type: 'done', model: 'mock-llm', inputTokens: 0, outputTokens: Math.ceil(text.length / 4), stopReason: 'end_turn' };
}
