import { requireUser } from '@/server/auth/session';
import { listConversations } from '@/server/services/conversations';
import { PageHeader, PageBody } from '@/components/app/page-header';
import { ConversationList } from '@/components/chat/conversation-list';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';

export const metadata = { title: 'Recent chats' };

export default async function ChatsPage({ searchParams }) {
  const user = await requireUser();
  const sp = await searchParams;
  const q = typeof sp.q === 'string' ? sp.q.trim().slice(0, 200) : '';
  const { conversations, nextCursor } = await listConversations(user.id, { q: q || undefined });
  return (
    <>
      <PageHeader
        title="Recent chats"
        description="Pick up where you left off, or search past questions and answers."
        actions={<Button href="/app/chat" size="sm"><Plus /> New chat</Button>}
      />
      <PageBody>
        <ConversationList initial={conversations} initialCursor={nextCursor} query={q} />
      </PageBody>
    </>
  );
}
