import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft, Download, TriangleAlert, MessagesSquare } from 'lucide-react';
import { requireUser } from '@/server/auth/session';
import { prisma } from '@/server/db';
import { getDocumentDetail, markOpened } from '@/server/services/documents';
import { listCollections } from '@/server/services/collections';
import { isAppError } from '@/server/errors';
import { DocumentViewer } from '@/components/viewer/document-viewer';
import { DocumentActions } from '@/components/app/document-actions';
import { ProcessingWatcher } from '@/components/app/processing-watcher';
import { RetryButton } from '@/components/app/retry-button';
import { AskDocumentButton, SuggestedQuestions } from '@/components/app/document-chat-actions';
import { Button } from '@/components/ui/button';
import { StatusPill, FileTypeBadge } from '@/components/ui/status';
import { formatBytes } from '@/lib/files';
import { formatDate, formatNumber, timeAgo } from '@/lib/format';

export const metadata = { title: 'Document' };

const int = (v) => (typeof v === 'string' && /^\d{1,7}$/.test(v) ? Number(v) : null);

export default async function DocumentPage({ params, searchParams }) {
  const user = await requireUser();
  const { id } = await params;
  const sp = await searchParams;

  let doc;
  try {
    doc = await getDocumentDetail(user.id, id);
  } catch (err) {
    if (isAppError(err) && err.status === 404) notFound();
    throw err;
  }
  await markOpened(user.id, doc.id);

  const [collections, conversations] = await Promise.all([
    listCollections(user.id),
    prisma.conversation.findMany({
      where: { userId: user.id, documents: { some: { documentId: doc.id } } },
      orderBy: { lastMessageAt: 'desc' },
      take: 5,
      select: { id: true, title: true, lastMessageAt: true },
    }),
  ]);

  // Citation deep link: ?page=&seg=&start=&end= — the passage text is read
  // from the stored extraction so highlighting never depends on client input.
  let highlight = null;
  const seg = int(sp.seg);
  const start = int(sp.start);
  const end = int(sp.end);
  if (seg && start !== null && end !== null && end > start) {
    const segment = await prisma.documentPage.findFirst({
      where: { documentId: doc.id, number: seg, document: { userId: user.id } },
      select: { text: true },
    });
    if (segment) {
      highlight = {
        segment: seg,
        start: Math.min(start, segment.text.length),
        end: Math.min(end, segment.text.length),
        page: doc.fileType === 'PDF' ? seg : null,
        text: segment.text.slice(start, end),
      };
    }
  }
  const initialPage = highlight?.page || int(sp.page) || 1;

  return (
    <div className="flex flex-1 flex-col">
      <ProcessingWatcher active={doc.status === 'QUEUED' || doc.status === 'PROCESSING'} />
      <div className="border-b border-line bg-surface px-4 py-4 sm:px-6 lg:px-8">
        <Link href="/app/documents" className="inline-flex items-center gap-1 text-sm text-ink-2 hover:text-ink">
          <ChevronLeft className="size-4" aria-hidden /> My documents
        </Link>
        <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h1 className="truncate text-xl font-semibold tracking-[-0.01em] text-ink">{doc.title}</h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-3">
              <FileTypeBadge type={doc.fileType} />
              <StatusPill status={doc.status} />
              <span>{formatBytes(doc.sizeBytes)}</span>
              {doc.pageCount ? <span>{doc.pageCount} pages</span> : null}
              <span>Added {formatDate(doc.createdAt)}</span>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <AskDocumentButton documentId={doc.id} disabled={doc.status !== 'READY'} />
            <Button href={`/api/documents/${doc.id}/file?download=1`} variant="secondary" size="sm" prefetch={false}>
              <Download /> <span className="hidden sm:inline">Download</span>
            </Button>
            <DocumentActions document={doc} collections={collections} />
          </div>
        </div>
      </div>

      <div className="grid flex-1 gap-6 p-4 sm:p-6 lg:grid-cols-[1fr_300px] lg:px-8">
        <div className="min-w-0">
          {doc.status === 'FAILED' && (
            <div role="alert" className="mb-4 flex flex-col gap-3 rounded-lg border border-danger/30 bg-danger-soft p-4 sm:flex-row sm:items-start">
              <TriangleAlert className="size-5 shrink-0 text-danger" aria-hidden />
              <div className="flex-1 text-sm">
                <p className="font-medium text-ink">Processing failed</p>
                <p className="mt-1 text-ink-2">{doc.errorMessage}</p>
              </div>
              <RetryButton documentId={doc.id} size="sm" />
            </div>
          )}
          {(doc.status === 'QUEUED' || doc.status === 'PROCESSING') && (
            <div role="status" className="mb-4 rounded-lg border border-line bg-info-soft p-4 text-sm text-ink">
              {doc.status === 'QUEUED' ? 'Queued for processing.' : 'Extracting text and building the search index…'}{' '}
              {doc.errorMessage && <span className="text-ink-2">{doc.errorMessage}</span>}
              <span className="text-ink-2"> This page updates automatically.</span>
            </div>
          )}
          {doc.fileType === 'PDF' || doc.status === 'READY' ? (
            <DocumentViewer document={doc} highlight={highlight} initialPage={initialPage} />
          ) : null}
        </div>

        <aside className="space-y-6 text-sm">
          {doc.status === 'READY' && doc.suggestedQuestions.length > 0 && (
            <section>
              <h2 className="mb-2 font-semibold text-ink">Questions to try</h2>
              <SuggestedQuestions documentId={doc.id} questions={doc.suggestedQuestions} />
            </section>
          )}

          <section>
            <h2 className="mb-2 font-semibold text-ink">Details</h2>
            <dl className="divide-y divide-line rounded-lg border border-line bg-surface">
              <Detail label="File name" value={doc.filename} />
              <Detail label="Type" value={doc.fileType} />
              <Detail label="Size" value={formatBytes(doc.sizeBytes)} />
              {doc.pageCount ? <Detail label="Pages" value={doc.pageCount} /> : null}
              {doc.charCount ? <Detail label="Characters" value={formatNumber(doc.charCount)} /> : null}
              <Detail label="Search passages" value={doc.chunkCount || '—'} />
              <Detail label="Processed" value={doc.processedAt ? timeAgo(doc.processedAt) : '—'} />
              <Detail label="Cited in answers" value={doc.citationCount} />
            </dl>
          </section>

          <section>
            <h2 className="mb-2 font-semibold text-ink">Collections</h2>
            {doc.collections.length ? (
              <ul className="flex flex-wrap gap-1.5">
                {doc.collections.map((c) => (
                  <li key={c.id}>
                    <Link href={`/app/collections/${c.id}`} className="inline-block rounded-full border border-line bg-surface px-2.5 py-1 text-xs text-ink hover:border-line-strong">
                      {c.name}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-ink-3">Not in any collection. Use the actions menu to add it.</p>
            )}
          </section>

          {conversations.length > 0 && (
            <section>
              <h2 className="mb-2 font-semibold text-ink">Conversations</h2>
              <ul className="space-y-1">
                {conversations.map((c) => (
                  <li key={c.id}>
                    <Link href={`/app/chat/${c.id}`} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-ink-2 hover:bg-surface-2 hover:text-ink">
                      <MessagesSquare className="size-3.5 shrink-0" aria-hidden />
                      <span className="flex-1 truncate">{c.title}</span>
                      <span className="text-xs text-ink-3">{timeAgo(c.lastMessageAt)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}

function Detail({ label, value }) {
  return (
    <div className="flex justify-between gap-4 px-3 py-2">
      <dt className="text-ink-3">{label}</dt>
      <dd className="truncate text-right text-ink">{value}</dd>
    </div>
  );
}
