import 'server-only';
import { Prisma } from '@prisma/client';
import { prisma } from '@/server/db';
import { getConfig } from '@/server/config';
import { getStorage } from '@/server/storage';
import { log } from '@/server/log';
import { extractText } from '@/server/processing/extract';
import { chunkSegments } from '@/server/processing/chunk';
import { sniffFileType } from '@/server/processing/filetype';
import { ProcessingError, ProcessingErrors } from '@/server/processing/errors';
import { embedTexts } from '@/server/ai/embeddings';
import { AiError } from '@/server/ai/errors';
import { complete } from '@/server/ai/llm';
import { SUGGEST_PROMPT } from '@/server/ai/prompt';
import { toVectorLiteral } from '@/server/retrieval/search';
import { recordUsage } from '@/server/services/usage';
import { enqueueJob, registerJobHandler } from '@/server/jobs/queue';

export const PROCESS_JOB = 'process-document';

export function enqueueDocumentProcessing(documentId, client = prisma) {
  return enqueueJob(PROCESS_JOB, `${PROCESS_JOB}:${documentId}`, { documentId }, client);
}

registerJobHandler(PROCESS_JOB, async ({ documentId }, ctx) => processDocument(documentId, ctx));

const INSERT_BATCH = 100;

/**
 * Extract → chunk → embed → store. Safe to run repeatedly: existing pages and
 * chunks for the document are replaced inside one transaction, so a retry
 * never leaves duplicates, and the document only becomes READY once every
 * chunk and embedding has been written.
 */
export async function processDocument(documentId, { isFinalAttempt = true } = {}) {
  const config = getConfig();
  const doc = await prisma.document.findUnique({ where: { id: documentId } });
  if (!doc || !['QUEUED', 'PROCESSING', 'FAILED'].includes(doc.status)) return { skipped: true };

  await prisma.document.update({
    where: { id: doc.id },
    data: { status: 'PROCESSING', errorCode: null, errorMessage: null, processingAttempts: { increment: 1 } },
  });

  try {
    const storage = getStorage();
    if (!(await storage.headObject(doc.storageKey))) throw ProcessingErrors.missingFile();
    const bytes = await storage.getObject(doc.storageKey);
    if (sniffFileType(bytes) !== doc.fileType) throw ProcessingErrors.unsupported();

    const { segments, pageCount, paginated } = await extractText(bytes, doc.fileType, {
      maxPages: config.MAX_PAGES_PER_DOCUMENT,
    });
    const chunks = chunkSegments(segments, { paginated });
    if (chunks.length === 0) throw ProcessingErrors.empty();

    // Prefixing the title gives each chunk document-level context in embedding space.
    const { vectors, model, tokens } = await embedTexts(
      chunks.map((c) => `${doc.title}\n\n${c.content}`),
      { inputType: 'document' },
    );

    const charCount = segments.reduce((n, s) => n + s.text.length, 0);
    await prisma.$transaction(
      async (tx) => {
        await tx.documentChunk.deleteMany({ where: { documentId: doc.id } });
        await tx.documentPage.deleteMany({ where: { documentId: doc.id } });
        await tx.documentPage.createMany({
          data: segments.map((s) => ({ documentId: doc.id, number: s.number, text: s.text })),
        });
        for (let i = 0; i < chunks.length; i += INSERT_BATCH) {
          const rows = chunks.slice(i, i + INSERT_BATCH).map((c, j) => {
            const id = `${doc.id}_${c.chunkIndex}`;
            return Prisma.sql`(${id}, ${doc.id}, ${doc.userId}, ${c.chunkIndex}, ${c.content}, ${c.pageNumber},
              ${c.segmentNumber}, ${c.charStart}, ${c.charEnd}, ${c.tokenCount}, ${model},
              ${toVectorLiteral(vectors[i + j])}::vector)`;
          });
          await tx.$executeRaw`
            INSERT INTO "DocumentChunk" (id, "documentId", "userId", "chunkIndex", content, "pageNumber",
              "segmentNumber", "charStart", "charEnd", "tokenCount", "embeddingModel", embedding)
            VALUES ${Prisma.join(rows)}`;
        }
        await tx.document.update({
          where: { id: doc.id },
          data: {
            status: 'READY',
            pageCount,
            charCount,
            chunkCount: chunks.length,
            embeddingModel: model,
            processedAt: new Date(),
            errorCode: null,
            errorMessage: null,
          },
        });
      },
      { timeout: 60_000, maxWait: 10_000 },
    );

    await recordUsage({ userId: doc.userId, kind: 'EMBEDDING', inputTokens: tokens, model }).catch(() => {});
    await generateSuggestedQuestions(doc.id, doc.userId, chunks).catch((err) =>
      log.warn('Suggested questions failed', { documentId: doc.id, err }),
    );
    return { chunks: chunks.length };
  } catch (err) {
    const failure = describeFailure(err);
    // Transient provider failures go back to QUEUED while the job layer retries.
    const willRetry = failure.retryable && !isFinalAttempt;
    await prisma.document.update({
      where: { id: doc.id },
      data: willRetry
        ? { status: 'QUEUED', errorCode: failure.code, errorMessage: `${failure.message} Retrying automatically.` }
        : { status: 'FAILED', errorCode: failure.code, errorMessage: failure.message },
    });
    if (!(err instanceof ProcessingError) && !(err instanceof AiError)) {
      log.error('Document processing crashed', { documentId: doc.id, err });
    }
    const wrapped = new Error(failure.message, { cause: err });
    wrapped.retryable = failure.retryable;
    throw wrapped;
  }
}

function describeFailure(err) {
  if (err instanceof ProcessingError) return { code: err.code, message: err.message, retryable: err.retryable };
  if (err instanceof AiError) {
    return { code: err.code, message: `Couldn't create search embeddings: ${err.message}`, retryable: err.retryable };
  }
  return {
    code: 'PROCESSING_FAILED',
    message: 'Something went wrong while processing this document. Try again.',
    retryable: true,
  };
}

/**
 * Suggested questions are generated from the document's own text so they are
 * guaranteed to be answerable. Non-fatal: the document is already READY.
 */
async function generateSuggestedQuestions(documentId, userId, chunks) {
  const config = getConfig();
  const sample = pickSpread(chunks, 6).map((c) => c.content.slice(0, 1200)).join('\n---\n');
  let questions;
  if (config.LLM_PROVIDER === 'mock') {
    questions = mockQuestions(chunks);
  } else {
    const result = await complete({ system: SUGGEST_PROMPT, prompt: sample, maxTokens: 2000 });
    questions = result.text
      .split('\n')
      .map((q) => q.replace(/^[\s\-*\d.)]+/, '').trim())
      .filter((q) => q.length > 8 && q.length <= 120 && q.endsWith('?'))
      .slice(0, 4);
    await recordUsage({ userId, kind: 'COMPLETION', inputTokens: result.inputTokens, outputTokens: result.outputTokens, model: result.model });
  }
  if (questions.length) {
    await prisma.document.update({ where: { id: documentId }, data: { suggestedQuestions: questions } });
  }
}

function pickSpread(items, n) {
  if (items.length <= n) return items;
  const step = items.length / n;
  return Array.from({ length: n }, (_, i) => items[Math.floor(i * step)]);
}

// Deterministic questions for the mock provider, built from section headings.
function mockQuestions(chunks) {
  const headings = new Set();
  for (const c of chunks) {
    for (const line of c.content.split('\n')) {
      const h = line.replace(/^[\d.]+\s*/, '').trim();
      if (h.length >= 4 && h.length <= 40 && !/[.,:;!?]$/.test(h) && !/^sample/i.test(h)) headings.add(h.toLowerCase());
    }
  }
  return [...headings].slice(0, 4).map((h) => `What does the document say about ${h}?`);
}
