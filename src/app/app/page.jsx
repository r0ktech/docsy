import Link from 'next/link';
import { FileText, MessagesSquare, ArrowRight } from 'lucide-react';
import { requireUser } from '@/server/auth/session';
import { prisma } from '@/server/db';
import { getUsage } from '@/server/services/usage';
import { listCollections } from '@/server/services/collections';
import { PageBody } from '@/components/app/page-header';
import { AskBox } from '@/components/app/ask-box';
import { QuickActions } from '@/components/app/quick-actions';
import { ProcessingWatcher } from '@/components/app/processing-watcher';
import { RetryButton } from '@/components/app/retry-button';
import { OnboardingUpload } from '@/components/app/onboarding-upload';
import { Card, Meter, SectionHeader } from '@/components/ui/misc';
import { StatusPill, FileTypeBadge } from '@/components/ui/status';
import { formatBytes } from '@/lib/files';
import { timeAgo, formatNumber } from '@/lib/format';

export const metadata = { title: 'Overview' };

export default async function OverviewPage() {
  const user = await requireUser();
  const [usage, collections, documents, recentDocs, activeDocs, recentChats] = await Promise.all([
    getUsage(user.id, user.plan),
    listCollections(user.id),
    prisma.document.findMany({
      where: { userId: user.id, status: { not: 'UPLOADING' } },
      select: { id: true, title: true, status: true, fileType: true },
      orderBy: { createdAt: 'desc' },
      take: 500,
    }),
    prisma.document.findMany({
      where: { userId: user.id, status: 'READY' },
      orderBy: [{ lastOpenedAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
      take: 5,
      select: { id: true, title: true, fileType: true, pageCount: true, sizeBytes: true, lastOpenedAt: true, createdAt: true },
    }),
    prisma.document.findMany({
      where: { userId: user.id, status: { in: ['QUEUED', 'PROCESSING', 'FAILED'] } },
      orderBy: { updatedAt: 'desc' },
      take: 6,
      select: { id: true, title: true, status: true, errorMessage: true, updatedAt: true },
    }),
    prisma.conversation.findMany({
      where: { userId: user.id, messages: { some: {} } },
      orderBy: { lastMessageAt: 'desc' },
      take: 5,
      select: {
        id: true,
        title: true,
        lastMessageAt: true,
        scopeType: true,
        collection: { select: { name: true } },
        _count: { select: { messages: true } },
      },
    }),
  ]);

  const firstName = (user.name || '').split(' ')[0];
  const hasDocs = documents.length > 0;
  const readyCount = documents.filter((d) => d.status === 'READY').length;
  const { limits } = usage;

  return (
    <PageBody className="py-8 lg:py-10">
      <ProcessingWatcher active={activeDocs.some((d) => d.status !== 'FAILED')} />
      <h1 className="font-serif text-3xl font-medium tracking-[-0.02em] text-ink">
        {firstName ? `Welcome back, ${firstName}` : 'Welcome back'}
      </h1>
      <p className="mt-1 text-sm text-ink-2">
        {hasDocs
          ? `${readyCount} of ${documents.length} document${documents.length === 1 ? '' : 's'} ready to search.`
          : 'Upload a document to start asking questions.'}
      </p>

      <div className="mt-6 grid gap-8 lg:grid-cols-[1fr_300px]">
        <div className="min-w-0 space-y-8">
          <AskBox
            collections={collections}
            documents={documents}
            disabled={readyCount === 0}
            disabledReason={hasDocs ? 'Your documents are still processing…' : 'Upload a document to ask questions'}
          />

          {!hasDocs && <OnboardingUpload maxUploadBytes={limits.maxUploadBytes} />}

          {hasDocs && (
            <section>
              <SectionHeader
                title="Recently opened"
                action={<Link href="/app/documents" className="text-sm text-ink-2 hover:text-ink">All documents</Link>}
              />
              {recentDocs.length === 0 ? (
                <p className="rounded-lg border border-dashed border-line-strong px-4 py-6 text-sm text-ink-2">
                  Documents appear here once they finish processing.
                </p>
              ) : (
                <Card className="divide-y divide-line">
                  {recentDocs.map((d) => (
                    <Link key={d.id} href={`/app/documents/${d.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-2/60">
                      <FileText className="size-4 shrink-0 text-ink-3" aria-hidden />
                      <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{d.title}</span>
                      <FileTypeBadge type={d.fileType} />
                      <span className="hidden w-28 text-right text-xs text-ink-3 sm:block">
                        {d.lastOpenedAt ? `Opened ${timeAgo(d.lastOpenedAt)}` : `Added ${timeAgo(d.createdAt)}`}
                      </span>
                    </Link>
                  ))}
                </Card>
              )}
            </section>
          )}

          {hasDocs && (
            <section>
              <SectionHeader
                title="Recent conversations"
                action={<Link href="/app/chats" className="text-sm text-ink-2 hover:text-ink">All chats</Link>}
              />
              {recentChats.length === 0 ? (
                <p className="rounded-lg border border-dashed border-line-strong px-4 py-6 text-sm text-ink-2">
                  Your conversations will show up here. Ask a question above to start one.
                </p>
              ) : (
                <Card className="divide-y divide-line">
                  {recentChats.map((c) => (
                    <Link key={c.id} href={`/app/chat/${c.id}`} className="group flex items-center gap-3 px-4 py-3 hover:bg-surface-2/60">
                      <MessagesSquare className="size-4 shrink-0 text-ink-3" aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-ink">{c.title}</span>
                        <span className="block truncate text-xs text-ink-3">
                          {c.scopeType === 'LIBRARY' ? 'All documents' : c.scopeType === 'COLLECTION' ? c.collection?.name || 'Collection' : 'Selected documents'}
                          {' · '}
                          {Math.ceil(c._count.messages / 2)} question{c._count.messages > 2 ? 's' : ''}
                        </span>
                      </span>
                      <span className="text-xs text-ink-3">{timeAgo(c.lastMessageAt)}</span>
                      <ArrowRight className="size-4 text-ink-3 opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
                    </Link>
                  ))}
                </Card>
              )}
            </section>
          )}
        </div>

        <aside className="space-y-6">
          {activeDocs.length > 0 && (
            <Card className="p-4">
              <SectionHeader title="Processing" />
              <ul className="space-y-3">
                {activeDocs.map((d) => (
                  <li key={d.id} className="text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <Link href={`/app/documents/${d.id}`} className="min-w-0 truncate font-medium text-ink hover:underline">
                        {d.title}
                      </Link>
                      <StatusPill status={d.status} />
                    </div>
                    {d.status === 'FAILED' && (
                      <div className="mt-1.5 flex items-start justify-between gap-2">
                        <p className="line-clamp-2 text-xs text-ink-3">{d.errorMessage}</p>
                        <RetryButton documentId={d.id} />
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Card className="space-y-4 p-4">
            <SectionHeader
              title="Usage"
              className="mb-0"
              action={<Link href="/app/settings#usage" className="text-xs text-ink-2 hover:text-ink">Details</Link>}
            />
            <Meter label="Documents" value={usage.documents} max={limits.maxDocuments} detail={`${usage.documents} / ${limits.maxDocuments}`} />
            <Meter
              label="Storage"
              value={usage.storageBytes}
              max={limits.maxStorageBytes}
              detail={`${formatBytes(usage.storageBytes)} / ${formatBytes(limits.maxStorageBytes)}`}
            />
            <Meter
              label="Questions this month"
              value={usage.questionsThisMonth}
              max={limits.maxQuestionsPerMonth}
              detail={`${usage.questionsThisMonth} / ${limits.maxQuestionsPerMonth}`}
            />
            <p className="text-xs text-ink-3">{formatNumber(usage.tokensThisMonth)} AI tokens used this month · Free plan</p>
          </Card>

          <Card className="p-2">
            <p className="px-3 pb-1 pt-2 text-sm font-semibold text-ink">Quick actions</p>
            <QuickActions />
          </Card>
        </aside>
      </div>
    </PageBody>
  );
}
