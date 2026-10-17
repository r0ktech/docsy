import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '@/server/db';
import { createConversation, getConversation } from '@/server/services/conversations';
import { prepareAnswer } from '@/server/services/chat';
import { hybridSearch } from '@/server/retrieval/search';
import { embedQuery } from '@/server/ai/embeddings';
import { POST as askRoute } from '@/app/api/conversations/[id]/messages/route';
import { POST as regenerateRoute } from '@/app/api/conversations/[id]/regenerate/route';
import { GET as getConversationRoute } from '@/app/api/conversations/[id]/route';
import { resetDb, createUser, uploadFile, sample, drain, signInAs, jsonRequest, ctx, readSse } from '../setup/helpers';

beforeEach(resetDb);

async function fullUser(user) {
  return prisma.user.findUniqueOrThrow({ where: { id: user.id } });
}

describe('retrieval', () => {
  it('finds the relevant passage and never returns another user’s chunks', async () => {
    const alice = await createUser();
    const bob = await createUser();
    await uploadFile(alice, sample('sample-apartment-lease.pdf'));
    await uploadFile(bob, sample('sample-remote-work-policy.txt'));

    const { vector, model } = await embedQuery('security deposit refund');
    const aliceResults = await hybridSearch({ userId: alice.id, documentIds: null, queryVector: vector, queryText: 'security deposit refund', embeddingModel: model });
    expect(aliceResults.length).toBeGreaterThan(0);
    expect(aliceResults[0].content).toMatch(/security deposit/i);

    const { vector: v2 } = await embedQuery('home office stipend');
    const crossUser = await hybridSearch({ userId: alice.id, documentIds: null, queryVector: v2, queryText: 'home office stipend', embeddingModel: model });
    expect(crossUser.every((r) => r.document.title.includes('lease'))).toBe(true);

    // Even if another user's document id is supplied explicitly, ownership filters it out.
    const bobDoc = await prisma.document.findFirst({ where: { userId: bob.id } });
    const forced = await hybridSearch({ userId: alice.id, documentIds: [bobDoc.id], queryVector: v2, queryText: 'stipend', embeddingModel: model });
    expect(forced).toEqual([]);
  });
});

describe('asking questions', () => {
  it('streams a grounded answer and persists messages with citations from real chunks', async () => {
    const user = await createUser();
    const lease = await uploadFile(user, sample('sample-apartment-lease.pdf'));
    const conv = await createConversation(user.id, { scope: { type: 'LIBRARY' } });

    const events = await drain(await prepareAnswer(await fullUser(user), conv.id, { question: 'How much is the security deposit?' }));
    expect(events.map((e) => e.event)).toEqual(expect.arrayContaining(['start', 'status', 'delta', 'done']));
    const message = events.find((e) => e.event === 'done').data.message;
    expect(message.status).toBe('COMPLETE');
    expect(message.grounding).toBe('grounded');
    expect(message.citations.length).toBeGreaterThan(0);

    for (const c of message.citations) {
      const chunk = await prisma.documentChunk.findFirst({ where: { documentId: c.documentId, pageNumber: c.pageNumber } });
      expect(chunk).toBeTruthy(); // page numbers come from stored chunks
      expect(c.documentId).toBe(lease.id);
      const page = await prisma.documentPage.findFirst({ where: { documentId: lease.id, number: c.segmentNumber } });
      const quoted = c.excerpt.replace(/^…|…$/g, '');
      expect(page.text.slice(c.charStart, c.charEnd).trim()).toBe(quoted.trim());
    }
    // Every [n] in the text maps to a stored citation.
    const markers = [...message.content.matchAll(/\[(\d+)\]/g)].map((m) => Number(m[1]));
    for (const n of markers) expect(message.citations.some((c) => c.sourceIndex === n)).toBe(true);

    const saved = await getConversation(user.id, conv.id);
    expect(saved.messages.map((m) => m.role)).toEqual(['USER', 'ASSISTANT']);
    expect(saved.title).toBe('How much is the security deposit?');
  });

  it('says so plainly when the documents do not contain the answer', async () => {
    const user = await createUser();
    await uploadFile(user, sample('sample-apartment-lease.pdf'));
    const conv = await createConversation(user.id, { scope: { type: 'LIBRARY' } });
    const events = await drain(await prepareAnswer(await fullUser(user), conv.id, { question: 'Which telescope discovered Neptune?' }));
    const message = events.find((e) => e.event === 'done').data.message;
    expect(message.grounding).toBe('insufficient');
    expect(message.citations).toHaveLength(0);
    expect(message.content).toMatch(/enough information|couldn't find/i);
  });

  it('restricts answers to the conversation scope', async () => {
    const user = await createUser();
    await uploadFile(user, sample('sample-apartment-lease.pdf'));
    const policy = await uploadFile(user, sample('sample-remote-work-policy.txt'));
    const conv = await createConversation(user.id, { scope: { type: 'DOCUMENTS', documentIds: [policy.id] } });
    const events = await drain(await prepareAnswer(await fullUser(user), conv.id, { question: 'How much is the security deposit for the apartment?' }));
    const message = events.find((e) => e.event === 'done').data.message;
    expect(message.citations.every((c) => c.documentId === policy.id)).toBe(true);
  });

  it('refuses to scope a conversation to documents the user does not own', async () => {
    const alice = await createUser();
    const bob = await createUser();
    const bobDoc = await uploadFile(bob, sample('sample-remote-work-policy.txt'));
    await expect(createConversation(alice.id, { scope: { type: 'DOCUMENTS', documentIds: [bobDoc.id] } })).rejects.toMatchObject({ status: 404 });
  });

  it('handles follow-up questions using conversation context', async () => {
    const user = await createUser();
    await uploadFile(user, sample('sample-apartment-lease.pdf'));
    const conv = await createConversation(user.id, { scope: { type: 'LIBRARY' } });
    const u = await fullUser(user);
    await drain(await prepareAnswer(u, conv.id, { question: 'What does the lease say about pets?' }));
    const events = await drain(await prepareAnswer(u, conv.id, { question: 'Is there a fee for that?' }));
    const message = events.find((e) => e.event === 'done').data.message;
    expect(message.content).toMatch(/pet/i);
    expect((await getConversation(user.id, conv.id)).messages).toHaveLength(4);
  });

  it('persists a failed answer with an error code when the model is unavailable', async () => {
    const user = await createUser();
    await uploadFile(user, sample('sample-apartment-lease.pdf'));
    const conv = await createConversation(user.id, { scope: { type: 'LIBRARY' } });
    process.env.MOCK_LLM_FAIL = '1';
    try {
      const events = await drain(await prepareAnswer(await fullUser(user), conv.id, { question: 'How much is rent?' }));
      const error = events.find((e) => e.event === 'error');
      expect(error.data.code).toBe('AI_UNAVAILABLE');
      expect(error.data.message).not.toMatch(/mock failure/);
    } finally {
      delete process.env.MOCK_LLM_FAIL;
    }
    const saved = await getConversation(user.id, conv.id);
    expect(saved.messages.at(-1)).toMatchObject({ role: 'ASSISTANT', status: 'FAILED', errorCode: 'AI_UNAVAILABLE' });
  });
});

describe('regenerate', () => {
  it('replaces the latest answer without creating duplicates', async () => {
    const user = await createUser();
    await uploadFile(user, sample('sample-apartment-lease.pdf'));
    const conv = await createConversation(user.id, { scope: { type: 'LIBRARY' } });
    await signInAs(user);

    const first = await readSse(await askRoute(jsonRequest(`/api/conversations/${conv.id}/messages`, { method: 'POST', body: { question: 'How much is rent?' } }), ctx({ id: conv.id })));
    const userMessageId = first.find((e) => e.event === 'start').data.userMessage.id;
    const oldAnswerId = first.find((e) => e.event === 'done').data.message.id;

    const again = await readSse(await regenerateRoute(jsonRequest(`/api/conversations/${conv.id}/regenerate`, { method: 'POST', body: { userMessageId } }), ctx({ id: conv.id })));
    const newAnswer = again.find((e) => e.event === 'done').data.message;
    expect(newAnswer.id).not.toBe(oldAnswerId);

    const res = await getConversationRoute(jsonRequest(`/api/conversations/${conv.id}`), ctx({ id: conv.id }));
    const { conversation } = await res.json();
    expect(conversation.messages).toHaveLength(2);
    expect(conversation.messages.filter((m) => m.replyToId === userMessageId)).toHaveLength(1);
    expect(await prisma.citation.count({ where: { messageId: oldAnswerId } })).toBe(0);
  });

  it('only allows regenerating the most recent answer', async () => {
    const user = await createUser();
    await uploadFile(user, sample('sample-apartment-lease.pdf'));
    const conv = await createConversation(user.id, { scope: { type: 'LIBRARY' } });
    const u = await fullUser(user);
    const e1 = await drain(await prepareAnswer(u, conv.id, { question: 'How much is rent?' }));
    await drain(await prepareAnswer(u, conv.id, { question: 'What about pets?' }));
    const firstUserId = e1.find((e) => e.event === 'start').data.userMessage.id;
    await expect(prepareAnswer(u, conv.id, { regenerateFor: firstUserId })).rejects.toMatchObject({ code: 'NOT_LATEST' });
  });
});

describe('conversation isolation', () => {
  it('hides other users’ conversations and blocks asking in them', async () => {
    const alice = await createUser();
    const bob = await createUser();
    const conv = await createConversation(alice.id, { scope: { type: 'LIBRARY' } });
    await signInAs(bob);
    const read = await getConversationRoute(jsonRequest(`/api/conversations/${conv.id}`), ctx({ id: conv.id }));
    expect(read.status).toBe(404);
    const ask = await askRoute(jsonRequest(`/api/conversations/${conv.id}/messages`, { method: 'POST', body: { question: 'anything?' } }), ctx({ id: conv.id }));
    expect(ask.status).toBe(404);
    expect(await prisma.message.count()).toBe(0);
  });
});
