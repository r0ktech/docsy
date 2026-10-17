import fs from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '@/server/db';
import { getStorage } from '@/server/storage';
import { createUpload, completeUpload, deleteDocuments, listDocuments, retryDocument } from '@/server/services/documents';
import { processDocument } from '@/server/processing/pipeline';
import { runPendingJobs } from '@/server/jobs';
import { POST as uploadRoute } from '@/app/api/uploads/route';
import { PUT as putContent } from '@/app/api/uploads/[id]/content/route';
import { GET as fileRoute } from '@/app/api/documents/[id]/file/route';
import { resetDb, createUser, uploadFile, sample, signInAs, jsonRequest, ctx } from '../setup/helpers';

beforeEach(resetDb);


describe('upload validation', () => {
  it('rejects unsupported extensions and oversized files before storing anything', async () => {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: (await createUser()).id } });
    await expect(createUpload(user, { filename: 'malware.exe', size: 10, sha256: 'a'.repeat(64) })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(createUpload(user, { filename: 'huge.pdf', size: 500 * 1024 * 1024, sha256: 'a'.repeat(64) })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(await prisma.document.count()).toBe(0);
  });

  it('rejects a file whose bytes do not match its extension and cleans it up', async () => {
    const user = await createUser();
    const fake = Buffer.from('plain text pretending to be a PDF');
    fs.writeFileSync('/tmp/docsy-fake.pdf', fake);
    await expect(uploadFile(user, '/tmp/docsy-fake.pdf')).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(await prisma.document.count()).toBe(0);
  });

  it('rejects uploads whose checksum does not match the declared one', async () => {
    const dbUser = await prisma.user.findUniqueOrThrow({ where: { id: (await createUser()).id } });
    const bytes = fs.readFileSync(sample('sample-remote-work-policy.txt'));
    const { document } = await createUpload(dbUser, { filename: 'policy.txt', size: bytes.length, sha256: 'b'.repeat(64) });
    const record = await prisma.document.findUnique({ where: { id: document.id } });
    await getStorage().putObject(record.storageKey, bytes);
    await expect(completeUpload(dbUser.id, document.id)).rejects.toThrow(/corrupted/);
    expect(await getStorage().headObject(record.storageKey)).toBeNull();
  });

  it('detects duplicate uploads per user, but allows the same file for different users', async () => {
    const a = await createUser();
    const b = await createUser();
    await uploadFile(a, sample('sample-remote-work-policy.txt'), { process: false });
    await expect(uploadFile(a, sample('sample-remote-work-policy.txt'))).rejects.toMatchObject({ code: 'DUPLICATE_DOCUMENT' });
    await expect(uploadFile(b, sample('sample-remote-work-policy.txt'), { process: false })).resolves.toBeTruthy();
  });

  it('refuses local upload bodies larger than declared', async () => {
    const user = await createUser();
    await signInAs(user);
    const res = await uploadRoute(jsonRequest('/api/uploads', { method: 'POST', body: { filename: 'a.txt', size: 5, sha256: 'c'.repeat(64) } }));
    const { document } = await res.json();
    const put = await putContent(
      new Request(`http://localhost:3000/api/uploads/${document.id}/content`, { method: 'PUT', headers: { Origin: 'http://localhost:3000' }, body: 'way more than five bytes' }),
      ctx({ id: document.id }),
    );
    expect(put.status).toBe(422);
  });
});

describe('processing pipeline', () => {
  it('extracts, chunks, embeds and stores a PDF with page references', async () => {
    const user = await createUser();
    const doc = await uploadFile(user, sample('sample-apartment-lease.pdf'));
    expect(doc.status).toBe('READY');
    expect(doc.pageCount).toBeGreaterThan(0);
    const chunks = await prisma.$queryRaw`
      SELECT "pageNumber", "userId", embedding IS NOT NULL AS has_embedding, vector_dims(embedding) AS dims
      FROM "DocumentChunk" WHERE "documentId" = ${doc.id}`;
    expect(chunks.length).toBe(doc.chunkCount);
    for (const c of chunks) {
      expect(c.pageNumber).toBeGreaterThanOrEqual(1);
      expect(c.userId).toBe(user.id);
      expect(c.has_embedding).toBe(true);
      expect(c.dims).toBe(1024);
    }
    expect(await prisma.documentPage.count({ where: { documentId: doc.id } })).toBe(doc.pageCount);
  });

  it('stores DOCX and TXT without page numbers', async () => {
    const user = await createUser();
    const docx = await uploadFile(user, sample('sample-product-launch-brief.docx'));
    const txt = await uploadFile(user, sample('sample-remote-work-policy.txt'));
    for (const d of [docx, txt]) {
      expect(d.status).toBe('READY');
      expect(d.pageCount).toBeNull();
      expect(await prisma.documentChunk.count({ where: { documentId: d.id, pageNumber: { not: null } } })).toBe(0);
    }
  });

  it('is idempotent: reprocessing replaces chunks instead of duplicating them', async () => {
    const user = await createUser();
    const doc = await uploadFile(user, sample('sample-remote-work-policy.txt'));
    const before = await prisma.documentChunk.count({ where: { documentId: doc.id } });
    await prisma.document.update({ where: { id: doc.id }, data: { status: 'QUEUED' } });
    await processDocument(doc.id);
    await processDocument(doc.id); // already READY → skipped
    expect(await prisma.documentChunk.count({ where: { documentId: doc.id } })).toBe(before);
  });

  it('marks scanned / text-less PDFs as failed with a helpful message', async () => {
    const user = await createUser();
    // A valid one-page PDF with no text layer.
    const pdf = Buffer.from(
      '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF',
    );
    fs.writeFileSync('/tmp/docsy-scan.pdf', pdf);
    const doc = await uploadFile(user, '/tmp/docsy-scan.pdf', { process: false });
    await expect(processDocument(doc.id)).rejects.toThrow();
    const failed = await prisma.document.findUnique({ where: { id: doc.id } });
    expect(failed.status).toBe('FAILED');
    expect(failed.errorCode).toBe('NO_EXTRACTABLE_TEXT');
    expect(failed.errorMessage).toMatch(/OCR/);
    expect(await prisma.documentChunk.count({ where: { documentId: doc.id } })).toBe(0);
  });

  it('runs through the durable job queue and allows retrying failures', async () => {
    const user = await createUser();
    const doc = await uploadFile(user, sample('sample-remote-work-policy.txt'), { process: false });
    expect((await prisma.document.findUnique({ where: { id: doc.id } })).status).toBe('QUEUED');
    const { processed } = await runPendingJobs({ timeBudgetMs: 20000 });
    expect(processed).toBe(1);
    expect((await prisma.document.findUnique({ where: { id: doc.id } })).status).toBe('READY');
    expect((await prisma.job.findFirst()).status).toBe('SUCCEEDED');

    await prisma.document.update({ where: { id: doc.id }, data: { status: 'FAILED', errorCode: 'X', errorMessage: 'x' } });
    await retryDocument(user.id, doc.id);
    expect(await prisma.job.count()).toBe(1); // reused, not duplicated
    await runPendingJobs({ timeBudgetMs: 20000 });
    expect((await prisma.document.findUnique({ where: { id: doc.id } })).status).toBe('READY');
  });

  it('keeps a document out of READY when embedding fails', async () => {
    const user = await createUser();
    const doc = await uploadFile(user, sample('sample-remote-work-policy.txt'), { process: false });
    process.env.EMBEDDING_PROVIDER = 'voyage'; // no key configured → provider error
    (await import('@/server/config')).resetConfigCache();
    try {
      await expect(processDocument(doc.id)).rejects.toThrow();
    } finally {
      process.env.EMBEDDING_PROVIDER = 'mock';
      (await import('@/server/config')).resetConfigCache();
    }
    const after = await prisma.document.findUnique({ where: { id: doc.id } });
    expect(after.status).toBe('FAILED');
    expect(after.errorCode).toBe('AI_NOT_CONFIGURED');
    expect(await prisma.documentChunk.count({ where: { documentId: doc.id } })).toBe(0);
  });
});

describe('library listing', () => {
  it('searches by filename and by extracted text', async () => {
    const user = await createUser();
    await uploadFile(user, sample('sample-remote-work-policy.txt'));
    await uploadFile(user, sample('sample-apartment-lease.pdf'));
    const byText = await listDocuments(user.id, { q: 'stipend' });
    expect(byText.documents.map((d) => d.filename)).toEqual(['sample-remote-work-policy.txt']);
    const byName = await listDocuments(user.id, { q: 'lease' });
    expect(byName.documents.map((d) => d.filename)).toContain('sample-apartment-lease.pdf');
    const byType = await listDocuments(user.id, { type: 'PDF' });
    expect(byType.total).toBe(1);
    const sorted = await listDocuments(user.id, { sort: 'sizeBytes', order: 'asc' });
    expect(sorted.documents[0].filename).toBe('sample-remote-work-policy.txt');
  });
});

describe('deletion and cleanup', () => {
  it('removes rows, chunks, pages, jobs and the stored file', async () => {
    const user = await createUser();
    const doc = await uploadFile(user, sample('sample-apartment-lease.pdf'));
    expect(await getStorage().headObject(doc.storageKey)).toBeTruthy();
    await deleteDocuments(user.id, [doc.id]);
    expect(await prisma.document.count()).toBe(0);
    expect(await prisma.documentChunk.count()).toBe(0);
    expect(await prisma.documentPage.count()).toBe(0);
    expect(await prisma.job.count()).toBe(0);
    expect(await getStorage().headObject(doc.storageKey)).toBeNull();
  });

  it('serves the original file only to its owner', async () => {
    const owner = await createUser();
    const other = await createUser();
    const doc = await uploadFile(owner, sample('sample-remote-work-policy.txt'));
    await signInAs(owner);
    const ok = await fileRoute(jsonRequest(`/api/documents/${doc.id}/file`), ctx({ id: doc.id }));
    expect(ok.status).toBe(200);
    expect(ok.headers.get('Cache-Control')).toContain('no-store');
    expect(await ok.text()).toContain('Remote Work Policy');
    await signInAs(other);
    const denied = await fileRoute(jsonRequest(`/api/documents/${doc.id}/file`), ctx({ id: doc.id }));
    expect(denied.status).toBe(404);
  });
});

describe('upload retries', () => {
  it('returns the same reservation when an in-progress upload is retried', async () => {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: (await createUser()).id } });
    const input = { filename: 'policy.txt', size: 100, sha256: 'd'.repeat(64) };
    const first = await createUpload(user, input);
    const second = await createUpload(user, input);
    expect(second.document.id).toBe(first.document.id);
    expect(await prisma.document.count()).toBe(1);
  });
});
