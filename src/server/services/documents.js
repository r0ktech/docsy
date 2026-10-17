import 'server-only';
import { z } from 'zod';
import { createHash } from 'node:crypto';
import { prisma } from '@/server/db';
import { Errors } from '@/server/errors';
import { getStorage, documentStorageKey } from '@/server/storage';
import { log } from '@/server/log';
import { FILE_TYPES, fileTypeFromName, sanitizeFilename, titleFromFilename, formatBytes } from '@/lib/files';
import { sniffFileType } from '@/server/processing/filetype';
import { enqueueDocumentProcessing } from '@/server/processing/pipeline';
import { assertCanUpload, planLimits } from '@/server/services/usage';
import { searchDocumentText } from '@/server/retrieval/search';

// Reservations whose bytes never arrived are reclaimable after this long.
const STALE_UPLOAD_MS = 60 * 60 * 1000;

export const createUploadSchema = z.object({
  filename: z.string().min(1).max(255),
  size: z.number().int().positive(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/, 'Invalid checksum.'),
});

/**
 * Step 1 of an upload: validate metadata, enforce limits, detect duplicates,
 * reserve a document row and return where the browser should PUT the bytes.
 */
export async function createUpload(user, input) {
  const { filename: rawName, size, sha256 } = createUploadSchema.parse(input);
  const filename = sanitizeFilename(rawName);
  const fileType = fileTypeFromName(filename);
  if (!fileType) throw Errors.validation('Only PDF, DOCX, and TXT files are supported.');
  const limits = planLimits(user.plan);
  if (size > limits.maxUploadBytes) {
    throw Errors.validation(`Files can be up to ${formatBytes(limits.maxUploadBytes)}. This one is ${formatBytes(size)}.`);
  }

  const doc = await prisma.$transaction(async (tx) => {
    // Serialise uploads per user so concurrent requests can't race past limits.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${user.id}))`;

    const existing = await tx.document.findUnique({
      where: { userId_sha256: { userId: user.id, sha256 } },
      select: { id: true, title: true, status: true, createdAt: true },
    });
    if (existing) {
      const stale = existing.status === 'UPLOADING' && Date.now() - existing.createdAt.getTime() > STALE_UPLOAD_MS;
      // A retried reservation for an upload still in progress gets the same
      // document back, so the client can safely retry after a dropped connection.
      if (existing.status === 'UPLOADING' && !stale) {
        return tx.document.findUniqueOrThrow({ where: { id: existing.id } });
      }
      if (!stale) {
        throw Errors.conflict('DUPLICATE_DOCUMENT', `You've already uploaded this file as "${existing.title}".`, {
          documentId: existing.id,
        });
      }
      await tx.document.delete({ where: { id: existing.id } });
    }

    await assertCanUpload(user.id, user.plan, size, tx);

    const created = await tx.document.create({
      data: {
        userId: user.id,
        title: titleFromFilename(filename),
        filename,
        fileType,
        mimeType: FILE_TYPES[fileType].mime,
        sizeBytes: size,
        sha256,
        storageKey: `pending-${sha256}-${user.id}-${Date.now()}`,
        status: 'UPLOADING',
      },
    });
    return tx.document.update({
      where: { id: created.id },
      data: { storageKey: documentStorageKey(user.id, created.id) },
    });
  });

  const target = await getStorage().createUploadTarget({
    key: doc.storageKey,
    documentId: doc.id,
    contentType: doc.mimeType,
    size: doc.sizeBytes,
  });
  return { document: serializeDocument(doc), upload: target };
}

/** Local storage driver only: receives the bytes through an authenticated route. */
export async function receiveUploadBytes(userId, documentId, request) {
  const doc = await getOwnedDocument(userId, documentId);
  if (doc.status !== 'UPLOADING') throw Errors.conflict('UPLOAD_CLOSED', 'This upload has already been completed.');
  const bytes = await readBodyWithLimit(request, doc.sizeBytes);
  await getStorage().putObject(doc.storageKey, bytes, doc.mimeType);
  return { received: bytes.length };
}

async function readBodyWithLimit(request, expectedSize) {
  const reader = request.body?.getReader();
  if (!reader) throw Errors.validation('Upload body is empty.');
  const parts = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > expectedSize) {
      await reader.cancel();
      throw Errors.validation('The uploaded file is larger than declared.');
    }
    parts.push(value);
  }
  return Buffer.concat(parts);
}

/**
 * Step 2: verify the bytes in storage (size, checksum, real file type) and
 * queue processing. Invalid uploads are deleted rather than kept around.
 */
export async function completeUpload(userId, documentId) {
  const doc = await getOwnedDocument(userId, documentId);
  if (doc.status !== 'UPLOADING') return serializeDocument(doc);

  const storage = getStorage();
  const head = await storage.headObject(doc.storageKey);
  if (!head) throw Errors.validation('The file has not finished uploading. Try again.');

  const bytes = await storage.getObject(doc.storageKey);
  const problem =
    bytes.length !== doc.sizeBytes
      ? 'The uploaded file size does not match what was declared.'
      : createHash('sha256').update(bytes).digest('hex') !== doc.sha256
        ? 'The uploaded file was corrupted in transit. Please upload it again.'
        : sniffFileType(bytes) !== doc.fileType
          ? `This file's contents are not a valid ${FILE_TYPES[doc.fileType].label} document.`
          : null;
  if (problem) {
    await storage.deleteObject(doc.storageKey).catch(() => {});
    await prisma.document.delete({ where: { id: doc.id } });
    throw Errors.validation(problem);
  }

  const updated = await prisma.$transaction(async (tx) => {
    const d = await tx.document.update({ where: { id: doc.id }, data: { status: 'QUEUED' } });
    await enqueueDocumentProcessing(doc.id, tx);
    return d;
  });
  return serializeDocument(updated);
}

export async function retryDocument(userId, documentId) {
  const doc = await getOwnedDocument(userId, documentId);
  if (doc.status !== 'FAILED') throw Errors.conflict('NOT_RETRYABLE', 'Only failed documents can be retried.');
  const updated = await prisma.$transaction(async (tx) => {
    const d = await tx.document.update({
      where: { id: doc.id },
      data: { status: 'QUEUED', errorCode: null, errorMessage: null },
    });
    await enqueueDocumentProcessing(doc.id, tx);
    return d;
  });
  return serializeDocument(updated);
}

export async function getOwnedDocument(userId, documentId) {
  const doc = await prisma.document.findFirst({ where: { id: documentId, userId } });
  if (!doc) throw Errors.notFound('Document');
  return doc;
}

export async function getDocumentDetail(userId, documentId) {
  const doc = await prisma.document.findFirst({
    where: { id: documentId, userId },
    include: {
      collections: { include: { collection: { select: { id: true, name: true } } } },
      _count: { select: { citations: true } },
    },
  });
  if (!doc) throw Errors.notFound('Document');
  return {
    ...serializeDocument(doc),
    collections: doc.collections.map((c) => c.collection),
    citationCount: doc._count.citations,
  };
}

export async function getDocumentText(userId, documentId) {
  await getOwnedDocument(userId, documentId);
  return prisma.documentPage.findMany({
    where: { documentId, document: { userId } },
    orderBy: { number: 'asc' },
    select: { number: true, text: true },
  });
}

export async function markOpened(userId, documentId) {
  await prisma.document.updateMany({ where: { id: documentId, userId }, data: { lastOpenedAt: new Date() } });
}

export async function renameDocument(userId, documentId, title) {
  await getOwnedDocument(userId, documentId);
  const doc = await prisma.document.update({ where: { id: documentId }, data: { title } });
  return serializeDocument(doc);
}

export const listSchema = z.object({
  q: z.string().trim().max(200).optional(),
  type: z.enum(['PDF', 'DOCX', 'TXT']).optional(),
  status: z.enum(['QUEUED', 'PROCESSING', 'READY', 'FAILED']).optional(),
  collectionId: z.string().max(64).optional(),
  sort: z.enum(['createdAt', 'title', 'sizeBytes']).default('createdAt'),
  order: z.enum(['asc', 'desc']).default('desc'),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(24),
});

export async function listDocuments(userId, rawQuery = {}) {
  const query = listSchema.parse(rawQuery);
  const where = { userId, status: query.status ?? { not: 'UPLOADING' } };
  if (query.type) where.fileType = query.type;
  if (query.collectionId) where.collections = { some: { collectionId: query.collectionId, collection: { userId } } };
  if (query.q) {
    const textMatches = await searchDocumentText(userId, query.q);
    where.OR = [
      { title: { contains: query.q, mode: 'insensitive' } },
      { filename: { contains: query.q, mode: 'insensitive' } },
      ...(textMatches.length ? [{ id: { in: textMatches } }] : []),
    ];
  }
  const [total, rows] = await Promise.all([
    prisma.document.count({ where }),
    prisma.document.findMany({
      where,
      orderBy: [{ [query.sort]: query.order }, { id: 'asc' }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      include: { collections: { select: { collection: { select: { id: true, name: true } } } } },
    }),
  ]);
  return {
    documents: rows.map((d) => ({ ...serializeDocument(d), collections: d.collections.map((c) => c.collection) })),
    total,
    page: query.page,
    pageSize: query.pageSize,
    pageCount: Math.max(1, Math.ceil(total / query.pageSize)),
  };
}

/**
 * Deletes documents with their pages, chunks and collection links (cascade),
 * then removes the stored files. Database rows go first: an orphaned file is
 * harmless and logged, whereas a row pointing at a missing file is not.
 */
export async function deleteDocuments(userId, documentIds) {
  const ids = [...new Set(documentIds)];
  const docs = await prisma.document.findMany({ where: { id: { in: ids }, userId }, select: { id: true, storageKey: true } });
  if (docs.length !== ids.length) throw Errors.notFound('Document');
  await prisma.document.deleteMany({ where: { id: { in: docs.map((d) => d.id) }, userId } });
  await prisma.job.deleteMany({ where: { dedupeKey: { in: docs.map((d) => `process-document:${d.id}`) } } });
  const storage = getStorage();
  await Promise.all(
    docs.map((d) =>
      storage.deleteObject(d.storageKey).catch((err) => log.warn('Orphaned storage object', { key: d.storageKey, err })),
    ),
  );
  return { deleted: docs.length };
}

export function serializeDocument(d) {
  return {
    id: d.id,
    title: d.title,
    filename: d.filename,
    fileType: d.fileType,
    sizeBytes: d.sizeBytes,
    status: d.status,
    errorCode: d.errorCode,
    errorMessage: d.errorMessage,
    pageCount: d.pageCount,
    charCount: d.charCount,
    chunkCount: d.chunkCount,
    suggestedQuestions: Array.isArray(d.suggestedQuestions) ? d.suggestedQuestions : [],
    isSample: d.isSample,
    processedAt: d.processedAt,
    lastOpenedAt: d.lastOpenedAt,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
  };
}
