import 'server-only';
import { prisma } from '@/server/db';
import { getConfig, integrationStatus } from '@/server/config';
import { Errors } from '@/server/errors';
import { log } from '@/server/log';
import { rateLimit, LIMITS } from '@/server/ratelimit';
import { embedQuery } from '@/server/ai/embeddings';
import { streamCompletion, complete } from '@/server/ai/llm';
import { AiErrors } from '@/server/ai/errors';
import {
  SYSTEM_PROMPT,
  REWRITE_PROMPT,
  TITLE_PROMPT,
  buildMessages,
  fitHistoryToBudget,
  fitSourcesToBudget,
} from '@/server/ai/prompt';
import { resolveCitations, bestExcerpt } from '@/server/ai/citations';
import { hybridSearch, resolveScopeDocumentIds } from '@/server/retrieval/search';
import { assertCanAsk, recordUsage } from '@/server/services/usage';
import { provisionalTitle, serializeMessage } from '@/server/services/conversations';
import { toAppError } from '@/server/http';

const PENDING_STALE_MS = 3 * 60 * 1000;
const HISTORY_MESSAGES = 12;

/**
 * Validates and persists the question, then returns an async generator that
 * runs retrieval + generation and yields stream events:
 *
 *   start   { userMessage, assistantMessageId }
 *   status  { stage: 'searching' | 'generating', sources? }
 *   delta   { text }
 *   done    { message }           — final, persisted assistant message with citations
 *   title   { title }             — first exchange only
 *   error   { code, message }     — assistant message is persisted as FAILED
 *
 * With `regenerateFor`, the existing answer to that user message is replaced
 * atomically. Message.replyToId is unique, so a question can never end up with
 * two answers, even if regenerate is clicked twice concurrently.
 */
export async function prepareAnswer(user, conversationId, { question, regenerateFor } = {}) {
  const conversation = await prisma.conversation.findFirst({ where: { id: conversationId, userId: user.id } });
  if (!conversation) throw Errors.notFound('Conversation');

  const ai = integrationStatus();
  if (!ai.llm.configured) throw toAppError(AiErrors.notConfigured('language model'));
  if (!ai.embeddings.configured) throw toAppError(AiErrors.notConfigured('embedding'));

  await rateLimit(`question:${user.id}`, LIMITS.question);
  await assertCanAsk(user.id, user.plan);

  const pending = await prisma.message.findFirst({
    where: { conversationId, status: 'PENDING', createdAt: { gt: new Date(Date.now() - PENDING_STALE_MS) } },
    select: { id: true },
  });
  if (pending) throw Errors.conflict('ANSWER_IN_PROGRESS', 'An answer is already being generated in this conversation.');

  let userMessage;
  let assistant;
  let isFirstExchange = false;

  if (regenerateFor) {
    userMessage = await prisma.message.findFirst({
      where: { id: regenerateFor, conversationId, role: 'USER' },
    });
    if (!userMessage) throw Errors.notFound('Message');
    const later = await prisma.message.count({
      where: { conversationId, role: 'USER', createdAt: { gt: userMessage.createdAt } },
    });
    if (later > 0) throw Errors.conflict('NOT_LATEST', 'Only the most recent answer can be regenerated.');
    assistant = await prisma.$transaction(async (tx) => {
      await tx.message.deleteMany({ where: { replyToId: userMessage.id } });
      return tx.message.create({
        data: { conversationId, role: 'ASSISTANT', content: '', status: 'PENDING', replyToId: userMessage.id },
      });
    }).catch((err) => {
      if (err.code === 'P2002') throw Errors.conflict('ANSWER_IN_PROGRESS', 'This answer is already being regenerated.');
      throw err;
    });
    question = userMessage.content;
  } else {
    const count = await prisma.message.count({ where: { conversationId } });
    isFirstExchange = count === 0;
    [userMessage, assistant] = await prisma.$transaction(async (tx) => {
      const u = await tx.message.create({ data: { conversationId, role: 'USER', content: question } });
      const a = await tx.message.create({
        data: { conversationId, role: 'ASSISTANT', content: '', status: 'PENDING', replyToId: u.id },
      });
      await tx.conversation.update({
        where: { id: conversationId },
        data: { lastMessageAt: new Date(), ...(isFirstExchange ? { title: provisionalTitle(question) } : {}) },
      });
      return [u, a];
    });
  }

  await recordUsage({ userId: user.id, kind: 'QUESTION' });

  const history = await prisma.message.findMany({
    where: { conversationId, status: 'COMPLETE', createdAt: { lt: userMessage.createdAt } },
    orderBy: { createdAt: 'desc' },
    take: HISTORY_MESSAGES,
    select: { role: true, content: true },
  });
  history.reverse();

  return runAnswer({ user, conversation, question, userMessage, assistantId: assistant.id, history, isFirstExchange });
}

async function* runAnswer({ user, conversation, question, userMessage, assistantId, history, isFirstExchange }) {
  const config = getConfig();
  yield {
    event: 'start',
    data: {
      userMessage: serializeMessage(userMessage),
      assistantMessageId: assistantId,
      ...(isFirstExchange ? { title: provisionalTitle(question) } : {}),
    },
  };

  try {
    yield { event: 'status', data: { stage: 'searching' } };

    const scopeIds = await resolveScopeDocumentIds(user.id, conversation);
    const readyCount = await prisma.document.count({
      where: { userId: user.id, status: 'READY', ...(scopeIds ? { id: { in: scopeIds } } : {}) },
    });
    if (readyCount === 0) {
      const message = await finalize(assistantId, conversation.id, {
        content:
          scopeIds === null
            ? "You don't have any processed documents yet. Upload a document and wait for it to finish processing, then ask again."
            : "None of the documents in this conversation's scope are ready yet. Wait for processing to finish, or check whether they failed.",
        grounding: 'insufficient',
      });
      yield { event: 'done', data: { message } };
      return;
    }

    const searchQuery = history.length ? await rewriteQuery(user.id, history, question) : question;
    const { vector, model: embeddingModel, tokens: embedTokens } = await embedQuery(searchQuery);
    recordUsage({ userId: user.id, kind: 'EMBEDDING', inputTokens: embedTokens, model: embeddingModel }).catch(() => {});

    const results = await hybridSearch({
      userId: user.id,
      documentIds: scopeIds,
      queryVector: vector,
      queryText: searchQuery,
      embeddingModel,
    });

    if (results.length === 0) {
      const message = await finalize(assistantId, conversation.id, {
        content:
          "I couldn't find anything in the documents in scope that relates to this question, so I can't answer it from your documents. Try rephrasing, or widen the scope to more documents.",
        grounding: 'insufficient',
      });
      yield { event: 'done', data: { message } };
      return;
    }

    const sources = fitSourcesToBudget(
      results.map((r, i) => ({
        id: i + 1,
        documentName: r.document.title,
        pageNumber: r.pageNumber,
        content: r.content,
        chunk: r,
      })),
      config.CONTEXT_TOKEN_BUDGET,
    );

    yield {
      event: 'status',
      data: { stage: 'generating', sources: sources.length, documents: new Set(sources.map((s) => s.chunk.documentId)).size },
    };

    const messages = buildMessages({
      question,
      sources,
      history: fitHistoryToBudget(history, config.HISTORY_TOKEN_BUDGET),
    });

    let text = '';
    let usage = {};
    for await (const ev of streamCompletion({ system: SYSTEM_PROMPT, messages, mockContext: { question, sources } })) {
      if (ev.type === 'text') {
        text += ev.text;
        yield { event: 'delta', data: { text: ev.text } };
      } else if (ev.type === 'done') {
        usage = ev;
      }
    }

    const { text: finalText, cited } = resolveCitations(text, sources);
    const citations = cited.map(({ sourceIndex, source }) => {
      const ex = bestExcerpt(source.chunk.content, searchQuery);
      return {
        sourceIndex,
        chunkId: source.chunk.id,
        documentId: source.chunk.documentId,
        documentName: source.documentName,
        pageNumber: source.chunk.pageNumber,
        segmentNumber: source.chunk.segmentNumber,
        charStart: source.chunk.charStart + ex.start,
        charEnd: source.chunk.charStart + ex.end,
        excerpt: ex.excerpt,
        score: source.chunk.score,
      };
    });

    const message = await finalize(assistantId, conversation.id, {
      content: finalText.trim() || "The documents don't provide enough information to answer this question.",
      grounding: citations.length ? 'grounded' : 'insufficient',
      model: usage.model,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      citations,
    });
    recordUsage({
      userId: user.id,
      kind: 'COMPLETION',
      inputTokens: usage.inputTokens || 0,
      outputTokens: usage.outputTokens || 0,
      model: usage.model,
    }).catch(() => {});

    yield { event: 'done', data: { message } };

    if (isFirstExchange) {
      const title = await generateTitle(user.id, conversation.id, question);
      if (title) yield { event: 'title', data: { title } };
    }
  } catch (err) {
    const appErr = toAppError(err) || {
      code: 'ANSWER_FAILED',
      message: 'Something went wrong while generating the answer. Try again.',
    };
    if (!toAppError(err)) log.error('Answer generation failed', { err, conversationId: conversation.id });
    await prisma.message
      .update({ where: { id: assistantId }, data: { status: 'FAILED', errorCode: appErr.code, content: '' } })
      .catch(() => {});
    yield { event: 'error', data: { code: appErr.code, message: appErr.message, assistantMessageId: assistantId } };
  }
}

async function finalize(assistantId, conversationId, { content, grounding, model, inputTokens, outputTokens, citations = [] }) {
  const saved = await prisma.$transaction(async (tx) => {
    await tx.citation.deleteMany({ where: { messageId: assistantId } });
    if (citations.length) {
      await tx.citation.createMany({ data: citations.map((c) => ({ ...c, messageId: assistantId })) });
    }
    await tx.conversation.update({ where: { id: conversationId }, data: { lastMessageAt: new Date() } });
    return tx.message.update({
      where: { id: assistantId },
      data: { content, status: 'COMPLETE', grounding, model, inputTokens, outputTokens, errorCode: null },
      include: { citations: { orderBy: { sourceIndex: 'asc' } } },
    });
  });
  return serializeMessage(saved);
}

/** Turns a follow-up ("what about its risks?") into a standalone search query. */
async function rewriteQuery(userId, history, question) {
  if (getConfig().LLM_PROVIDER === 'mock') {
    const lastUser = [...history].reverse().find((m) => m.role === 'USER');
    return lastUser ? `${lastUser.content} ${question}` : question;
  }
  try {
    const convo = history
      .slice(-6)
      .map((m) => `${m.role === 'USER' ? 'User' : 'Assistant'}: ${m.content.slice(0, 600)}`)
      .join('\n');
    const result = await complete({
      system: REWRITE_PROMPT,
      prompt: `Conversation:\n${convo}\n\nLatest question: ${question}`,
      maxTokens: 1000,
    });
    recordUsage({ userId, kind: 'COMPLETION', inputTokens: result.inputTokens, outputTokens: result.outputTokens, model: result.model }).catch(() => {});
    const rewritten = result.text.split('\n')[0].trim();
    return rewritten.length > 3 && rewritten.length < 500 ? rewritten : question;
  } catch (err) {
    log.warn('Query rewrite failed; using original question', { err });
    return question;
  }
}

async function generateTitle(userId, conversationId, question) {
  if (getConfig().LLM_PROVIDER === 'mock') return null;
  try {
    const result = await complete({ system: TITLE_PROMPT, prompt: question, maxTokens: 500 });
    const title = result.text.replace(/^["'\s]+|["'.\s]+$/g, '').slice(0, 80);
    if (title.length < 3) return null;
    await prisma.conversation.updateMany({ where: { id: conversationId, userId }, data: { title } });
    recordUsage({ userId, kind: 'COMPLETION', inputTokens: result.inputTokens, outputTokens: result.outputTokens, model: result.model }).catch(() => {});
    return title;
  } catch {
    return null;
  }
}
