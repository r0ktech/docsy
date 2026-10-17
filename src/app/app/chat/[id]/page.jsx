import { notFound } from 'next/navigation';
import { requireUser } from '@/server/auth/session';
import { prisma } from '@/server/db';
import { getConversation } from '@/server/services/conversations';
import { isAppError } from '@/server/errors';
import { ChatView } from '@/components/chat/chat-view';

export const metadata = { title: 'Conversation' };

export default async function ConversationPage({ params }) {
  const user = await requireUser();
  const { id } = await params;
  let conversation;
  try {
    conversation = await getConversation(user.id, id);
  } catch (err) {
    if (isAppError(err) && err.status === 404) notFound();
    throw err;
  }

  // Suggested questions come from the documents' own content (generated at
  // processing time), restricted to documents in this conversation's scope.
  let suggestions = [];
  if (conversation.messages.length === 0) {
    let docs;
    if (conversation.scopeType === 'DOCUMENTS') docs = conversation.documents;
    else {
      docs = await prisma.document.findMany({
        where: {
          userId: user.id,
          status: 'READY',
          ...(conversation.scopeType === 'COLLECTION' ? { collections: { some: { collectionId: conversation.collection?.id ?? '' } } } : {}),
        },
        orderBy: [{ lastOpenedAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
        take: 4,
        select: { suggestedQuestions: true },
      });
    }
    suggestions = [...new Set(docs.flatMap((d) => (Array.isArray(d.suggestedQuestions) ? d.suggestedQuestions.slice(0, 2) : [])))].slice(0, 4);
  }

  return <ChatView key={conversation.id} conversation={conversation} suggestions={suggestions} />;
}
