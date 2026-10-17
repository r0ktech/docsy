import 'server-only';
import { prisma } from '@/server/db';
import { Errors } from '@/server/errors';

export function provisionalTitle(question) {
  const clean = question.replace(/\s+/g, ' ').trim();
  if (clean.length <= 60) return clean;
  const cut = clean.slice(0, 60);
  return `${cut.slice(0, cut.lastIndexOf(' ') > 30 ? cut.lastIndexOf(' ') : 60)}…`;
}

/**
 * Creates a conversation with a validated scope. Every referenced collection
 * and document must belong to the user.
 */
export async function createConversation(userId, { scope, title }) {
  const data = { userId, title: title || 'New conversation', scopeType: scope.type };
  if (scope.type === 'COLLECTION') {
    const c = await prisma.collection.findFirst({ where: { id: scope.collectionId, userId }, select: { id: true } });
    if (!c) throw Errors.notFound('Collection');
    data.collectionId = c.id;
  }
  if (scope.type === 'DOCUMENTS') {
    const ids = [...new Set(scope.documentIds)];
    const docs = await prisma.document.findMany({ where: { id: { in: ids }, userId }, select: { id: true } });
    if (docs.length !== ids.length) throw Errors.notFound('Document');
    if (ids.length === 1) data.documentId = ids[0];
    data.documents = { create: ids.map((documentId) => ({ documentId })) };
  }
  const conv = await prisma.conversation.create({ data });
  return getConversation(userId, conv.id);
}

export async function listConversations(userId, { q, take = 50, cursor } = {}) {
  const where = { userId };
  if (q) {
    where.OR = [
      { title: { contains: q, mode: 'insensitive' } },
      { messages: { some: { content: { contains: q, mode: 'insensitive' } } } },
    ];
  }
  const rows = await prisma.conversation.findMany({
    where,
    orderBy: [{ lastMessageAt: 'desc' }, { id: 'desc' }],
    take: take + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: {
      id: true,
      title: true,
      scopeType: true,
      lastMessageAt: true,
      createdAt: true,
      collection: { select: { id: true, name: true } },
      document: { select: { id: true, title: true } },
      _count: { select: { messages: true, documents: true } },
    },
  });
  const hasMore = rows.length > take;
  return { conversations: rows.slice(0, take), nextCursor: hasMore ? rows[take - 1].id : null };
}

export async function getConversation(userId, id) {
  const conv = await prisma.conversation.findFirst({
    where: { id, userId },
    include: {
      collection: { select: { id: true, name: true } },
      documents: { select: { document: { select: { id: true, title: true, status: true, fileType: true, suggestedQuestions: true } } } },
      messages: {
        orderBy: { createdAt: 'asc' },
        include: { citations: { orderBy: { sourceIndex: 'asc' } } },
      },
    },
  });
  if (!conv) throw Errors.notFound('Conversation');
  return serializeConversation(conv);
}

export async function renameConversation(userId, id, title) {
  const owned = await prisma.conversation.findFirst({ where: { id, userId }, select: { id: true } });
  if (!owned) throw Errors.notFound('Conversation');
  await prisma.conversation.update({ where: { id }, data: { title } });
  return { id, title };
}

export async function deleteConversation(userId, id) {
  const { count } = await prisma.conversation.deleteMany({ where: { id, userId } });
  if (!count) throw Errors.notFound('Conversation');
}

export function serializeConversation(conv) {
  return {
    id: conv.id,
    title: conv.title,
    scopeType: conv.scopeType,
    collection: conv.collection,
    documents: conv.documents.map((d) => ({
      ...d.document,
      suggestedQuestions: Array.isArray(d.document.suggestedQuestions) ? d.document.suggestedQuestions : [],
    })),
    lastMessageAt: conv.lastMessageAt,
    createdAt: conv.createdAt,
    messages: conv.messages.map(serializeMessage),
  };
}

export function serializeMessage(m) {
  return {
    id: m.id,
    role: m.role,
    content: m.content,
    status: m.status,
    errorCode: m.errorCode,
    grounding: m.grounding,
    replyToId: m.replyToId,
    model: m.model,
    createdAt: m.createdAt,
    citations: (m.citations || []).map((c) => ({
      id: c.id,
      sourceIndex: c.sourceIndex,
      documentId: c.documentId,
      documentName: c.documentName,
      pageNumber: c.pageNumber,
      segmentNumber: c.segmentNumber,
      charStart: c.charStart,
      charEnd: c.charEnd,
      excerpt: c.excerpt,
    })),
  };
}
