import { redirect } from 'next/navigation';
import { getSessionUser } from '@/server/auth/session';
import { prisma } from '@/server/db';
import { integrationStatus } from '@/server/config';
import { planLimits } from '@/server/services/usage';
import { AppShell } from '@/components/app/app-shell';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }) {
  const user = await getSessionUser();
  if (!user) redirect('/sign-in?expired=1');
  const recentChats = await prisma.conversation.findMany({
    where: { userId: user.id },
    orderBy: { lastMessageAt: 'desc' },
    take: 8,
    select: { id: true, title: true },
  });
  const status = integrationStatus();
  return (
    <AppShell
      user={{ id: user.id, name: user.name, email: user.email }}
      recentChats={recentChats}
      limits={planLimits(user.plan)}
      aiStatus={{ llm: status.llm, embeddings: status.embeddings }}
    >
      {children}
    </AppShell>
  );
}
