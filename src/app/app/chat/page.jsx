import Link from 'next/link';
import { requireUser } from '@/server/auth/session';
import { prisma } from '@/server/db';
import { listCollections } from '@/server/services/collections';
import { AskBox } from '@/components/app/ask-box';
import { PageBody } from '@/components/app/page-header';

export const metadata = { title: 'New chat' };

export default async function NewChatPage({ searchParams }) {
  const user = await requireUser();
  const sp = await searchParams;
  const [collections, documents] = await Promise.all([
    listCollections(user.id),
    prisma.document.findMany({
      where: { userId: user.id, status: { not: 'UPLOADING' } },
      select: { id: true, title: true, status: true, fileType: true },
      orderBy: { createdAt: 'desc' },
      take: 500,
    }),
  ]);
  const ready = documents.filter((d) => d.status === 'READY');

  let initialScope = { type: 'LIBRARY' };
  if (typeof sp.collectionId === 'string' && collections.some((c) => c.id === sp.collectionId)) {
    initialScope = { type: 'COLLECTION', collectionId: sp.collectionId };
  } else if (typeof sp.documentId === 'string' && ready.some((d) => d.id === sp.documentId)) {
    initialScope = { type: 'DOCUMENTS', documentIds: [sp.documentId] };
  }

  return (
    <PageBody className="flex flex-1 flex-col justify-center py-12">
      <div className="mx-auto w-full max-w-2xl">
        <h1 className="font-serif text-3xl font-medium tracking-[-0.02em] text-ink">New conversation</h1>
        <p className="mt-1.5 text-sm text-ink-2">
          Choose what to search, then ask. Every answer cites the passages it used.
        </p>
        <div className="mt-6">
          <AskBox
            collections={collections}
            documents={documents}
            initialScope={initialScope}
            disabled={ready.length === 0}
            disabledReason={documents.length ? 'Your documents are still processing…' : 'Upload a document first'}
            autoFocus
          />
        </div>
        {documents.length === 0 && (
          <p className="mt-4 text-sm text-ink-2">
            You haven't uploaded anything yet. <Link href="/app/documents" className="font-medium text-ink underline underline-offset-4">Go to your library</Link> to add documents.
          </p>
        )}
        <ul className="mt-8 grid gap-4 text-sm text-ink-2 sm:grid-cols-3">
          <li><span className="font-medium text-ink">Be specific.</span> Name the thing you're looking for — a clause, a figure, a decision.</li>
          <li><span className="font-medium text-ink">Narrow the scope</span> to one document or collection for sharper answers.</li>
          <li><span className="font-medium text-ink">Follow up</span> freely — Docsy re-searches your documents each time.</li>
        </ul>
      </div>
    </PageBody>
  );
}
