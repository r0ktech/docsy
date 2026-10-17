import 'server-only';
import { Prisma } from '@prisma/client';
import { prisma } from '@/server/db';
import { getConfig } from '@/server/config';
import { Errors } from '@/server/errors';
import { tokenize } from '@/server/ai/mock';

/**
 * Resolves a conversation scope into the list of READY document ids the user
 * owns. Ownership is enforced here and again in the SQL itself.
 * Returns null for "entire library".
 */
export async function resolveScopeDocumentIds(userId, conversation) {
  if (conversation.scopeType === 'LIBRARY') return null;
  if (conversation.scopeType === 'COLLECTION') {
    if (!conversation.collectionId) return [];
    const rows = await prisma.collectionDocument.findMany({
      where: { collectionId: conversation.collectionId, collection: { userId }, document: { userId } },
      select: { documentId: true },
    });
    return rows.map((r) => r.documentId);
  }
  const rows = await prisma.conversationDocument.findMany({
    where: { conversationId: conversation.id, document: { userId } },
    select: { documentId: true },
  });
  return rows.map((r) => r.documentId);
}

export function toVectorLiteral(vector) {
  if (!Array.isArray(vector) || vector.some((x) => !Number.isFinite(x))) throw new Error('Invalid embedding vector');
  return `[${vector.join(',')}]`;
}

/** Builds an OR-combined prefix tsquery from user text, safe for to_tsquery. */
export function buildTsQuery(text, operator = '|') {
  const terms = [...new Set(String(text).toLowerCase().match(/[\p{L}\p{N}]{2,}/gu) || [])]
    .filter((t) => tokenize(t).length > 0)
    .slice(0, 24);
  return terms.length ? terms.map((t) => `${t}:*`).join(` ${operator} `) : null;
}

/**
 * Hybrid retrieval: pgvector cosine similarity + Postgres full-text search,
 * merged with Reciprocal Rank Fusion. Vector search catches paraphrases;
 * keyword search catches exact names, codes, and numbers embeddings miss.
 *
 * Every query filters on c."userId" = the requesting user and on READY
 * documents, so a user can never retrieve another user's chunks even if a
 * document id from another account were somehow supplied.
 */
export async function hybridSearch({ userId, documentIds, queryVector, queryText, embeddingModel, topK }) {
  const config = getConfig();
  const k = topK ?? config.RETRIEVAL_TOP_K;
  if (Array.isArray(documentIds) && documentIds.length === 0) return [];
  const candidateLimit = Math.max(30, k * 4);

  const docFilter = Array.isArray(documentIds) ? Prisma.sql`AND c."documentId" = ANY(${documentIds}::text[])` : Prisma.empty;
  const vectorLiteral = toVectorLiteral(queryVector);

  const vectorQuery = Prisma.sql`
    SELECT c.id, 1 - (c.embedding <=> ${vectorLiteral}::vector) AS similarity
    FROM "DocumentChunk" c
    JOIN "Document" d ON d.id = c."documentId"
    WHERE c."userId" = ${userId} AND d."userId" = ${userId} AND d.status = 'READY'
      AND c."embeddingModel" = ${embeddingModel} AND c.embedding IS NOT NULL
      ${docFilter}
    ORDER BY c.embedding <=> ${vectorLiteral}::vector
    LIMIT ${candidateLimit}`;

  const tsQuery = buildTsQuery(queryText);

  const iterative = await supportsIterativeScan();
  const [vectorRows, keywordRows] = await prisma.$transaction(async (tx) => {
    // pgvector >= 0.8: keep scanning the HNSW graph until enough rows pass the
    // per-user filter, instead of filtering a fixed-size candidate set.
    if (iterative) {
      await tx.$executeRawUnsafe(`SET LOCAL hnsw.iterative_scan = relaxed_order`);
    }
    const v = await tx.$queryRaw(vectorQuery);
    const kw = tsQuery
      ? await tx.$queryRaw`
          SELECT c.id, ts_rank_cd(c.tsv, to_tsquery('english', ${tsQuery})) AS rank
          FROM "DocumentChunk" c
          JOIN "Document" d ON d.id = c."documentId"
          WHERE c."userId" = ${userId} AND d."userId" = ${userId} AND d.status = 'READY'
            AND c.tsv @@ to_tsquery('english', ${tsQuery})
            ${docFilter}
          ORDER BY rank DESC
          LIMIT ${candidateLimit}`
      : [];
    return [v, kw];
  });

  const fused = reciprocalRankFusion(
    vectorRows.filter((r) => Number(r.similarity) >= config.RETRIEVAL_MIN_SIMILARITY),
    keywordRows,
  ).slice(0, k);
  if (fused.length === 0) return [];

  const chunks = await prisma.documentChunk.findMany({
    where: { id: { in: fused.map((f) => f.id) }, userId },
    select: {
      id: true,
      documentId: true,
      content: true,
      pageNumber: true,
      segmentNumber: true,
      charStart: true,
      charEnd: true,
      document: { select: { title: true, fileType: true } },
    },
  });
  const byId = new Map(chunks.map((c) => [c.id, c]));
  return fused
    .filter((f) => byId.has(f.id))
    .map((f) => ({ ...byId.get(f.id), score: f.score, similarity: f.similarity }));
}

let iterativeScan;
async function supportsIterativeScan() {
  if (iterativeScan === undefined) {
    const rows = await prisma.$queryRaw`SELECT extversion FROM pg_extension WHERE extname = 'vector'`;
    const [major, minor] = String(rows[0]?.extversion || '0.0').split('.').map(Number);
    iterativeScan = major > 0 || minor >= 8;
  }
  return iterativeScan;
}

/** Reciprocal Rank Fusion (Cormack et al., 2009) with the standard k = 60. */
export function reciprocalRankFusion(vectorRows, keywordRows, kConst = 60) {
  const scores = new Map();
  vectorRows.forEach((r, i) => {
    const entry = scores.get(r.id) || { id: r.id, score: 0, similarity: Number(r.similarity) };
    entry.score += 1 / (kConst + i + 1);
    scores.set(r.id, entry);
  });
  keywordRows.forEach((r, i) => {
    const entry = scores.get(r.id) || { id: r.id, score: 0, similarity: null };
    entry.score += 1 / (kConst + i + 1);
    scores.set(r.id, entry);
  });
  return [...scores.values()].sort((a, b) => b.score - a.score);
}

/** Ids of the user's documents whose extracted text matches a search phrase. */
export async function searchDocumentText(userId, text, limit = 200) {
  const tsQuery = buildTsQuery(text, '&');
  if (!tsQuery) return [];
  const rows = await prisma.$queryRaw`
    SELECT DISTINCT c."documentId" AS id
    FROM "DocumentChunk" c
    WHERE c."userId" = ${userId} AND c.tsv @@ to_tsquery('english', ${tsQuery})
    LIMIT ${limit}`;
  return rows.map((r) => r.id);
}

export function assertOwned(record, what) {
  if (!record) throw Errors.notFound(what);
  return record;
}
