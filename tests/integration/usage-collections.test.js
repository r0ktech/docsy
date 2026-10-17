import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '@/server/db';
import { resetConfigCache } from '@/server/config';
import { getUsage, assertCanAsk } from '@/server/services/usage';
import { createConversation } from '@/server/services/conversations';
import { prepareAnswer } from '@/server/services/chat';
import {
  createCollection,
  addDocumentsToCollection,
  removeDocumentsFromCollection,
  deleteCollection,
  getCollection,
  updateCollection,
} from '@/server/services/collections';
import { deleteAccount } from '@/server/services/account';
import { getStorage } from '@/server/storage';
import { resetDb, createUser, uploadFile, sample, drain } from '../setup/helpers';

beforeEach(resetDb);

function withEnv(vars, fn) {
  const old = {};
  for (const [k, v] of Object.entries(vars)) {
    old[k] = process.env[k];
    process.env[k] = v;
  }
  resetConfigCache();
  return Promise.resolve(fn()).finally(() => {
    for (const [k, v] of Object.entries(old)) v === undefined ? delete process.env[k] : (process.env[k] = v);
    resetConfigCache();
  });
}

describe('usage limits', () => {
  it('reports real usage from the database', async () => {
    const user = await createUser();
    const doc = await uploadFile(user, sample('sample-remote-work-policy.txt'));
    const usage = await getUsage(user.id);
    expect(usage.documents).toBe(1);
    expect(usage.storageBytes).toBe(doc.sizeBytes);
    expect(usage.tokensThisMonth).toBeGreaterThan(0);
  });

  it('enforces the document limit on the server', () =>
    withEnv({ FREE_MAX_DOCUMENTS: '1' }, async () => {
      const user = await createUser();
      await uploadFile(user, sample('sample-remote-work-policy.txt'), { process: false });
      await expect(uploadFile(user, sample('sample-apartment-lease.pdf'), { process: false })).rejects.toMatchObject({ code: 'DOCUMENT_LIMIT_REACHED', status: 402 });
    }));

  it('enforces the storage limit on the server', () =>
    withEnv({ FREE_MAX_STORAGE_MB: '0' }, async () => {
      const user = await createUser();
      await expect(uploadFile(user, sample('sample-remote-work-policy.txt'), { process: false })).rejects.toMatchObject({ code: 'STORAGE_LIMIT_REACHED' });
    }));

  it('enforces the monthly question limit and counts each question', () =>
    withEnv({ FREE_MAX_QUESTIONS_PER_MONTH: '1' }, async () => {
      const user = await createUser();
      await uploadFile(user, sample('sample-remote-work-policy.txt'));
      const full = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
      const conv = await createConversation(user.id, { scope: { type: 'LIBRARY' } });
      await drain(await prepareAnswer(full, conv.id, { question: 'What is the stipend?' }));
      await expect(prepareAnswer(full, conv.id, { question: 'And the internet allowance?' })).rejects.toMatchObject({ code: 'QUESTION_LIMIT_REACHED' });
      await expect(assertCanAsk(user.id, 'free')).rejects.toBeTruthy();
      expect(await prisma.message.count({ where: { role: 'USER' } })).toBe(1);
    }));
});

describe('collections', () => {
  it('creates, renames, fills, empties and deletes a collection without deleting documents', async () => {
    const user = await createUser();
    const doc = await uploadFile(user, sample('sample-remote-work-policy.txt'));
    const c = await createCollection(user.id, { name: 'HR' });
    await expect(createCollection(user.id, { name: 'HR' })).rejects.toMatchObject({ code: 'COLLECTION_EXISTS' });
    await updateCollection(user.id, c.id, { name: 'People' });
    expect((await addDocumentsToCollection(user.id, c.id, [doc.id])).documentCount).toBe(1);
    expect((await addDocumentsToCollection(user.id, c.id, [doc.id])).documentCount).toBe(1); // idempotent
    expect((await removeDocumentsFromCollection(user.id, c.id, [doc.id])).documentCount).toBe(0);
    await addDocumentsToCollection(user.id, c.id, [doc.id]);
    await deleteCollection(user.id, c.id);
    expect(await prisma.document.count({ where: { id: doc.id } })).toBe(1);
  });

  it('prevents using another user’s collection or documents', async () => {
    const alice = await createUser();
    const bob = await createUser();
    const bobDoc = await uploadFile(bob, sample('sample-remote-work-policy.txt'));
    const aliceCol = await createCollection(alice.id, { name: 'Mine' });
    await expect(addDocumentsToCollection(alice.id, aliceCol.id, [bobDoc.id])).rejects.toMatchObject({ status: 404 });
    await expect(getCollection(bob.id, aliceCol.id)).rejects.toMatchObject({ status: 404 });
    await expect(deleteCollection(bob.id, aliceCol.id)).rejects.toMatchObject({ status: 404 });
  });
});

describe('account deletion', () => {
  it('removes every row and stored file belonging to the user', async () => {
    const user = await createUser();
    const doc = await uploadFile(user, sample('sample-apartment-lease.pdf'));
    await createConversation(user.id, { scope: { type: 'LIBRARY' } });
    await deleteAccount(user.id);
    for (const model of ['user', 'document', 'documentChunk', 'conversation', 'session', 'usageRecord']) {
      expect(await prisma[model].count()).toBe(0);
    }
    expect(await getStorage().headObject(doc.storageKey)).toBeNull();
  });
});
