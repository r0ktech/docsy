import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft, MessageSquarePlus, FolderTree } from 'lucide-react';
import { requireUser } from '@/server/auth/session';
import { prisma } from '@/server/db';
import { getCollection, listCollections } from '@/server/services/collections';
import { listDocuments } from '@/server/services/documents';
import { isAppError } from '@/server/errors';
import { PageBody } from '@/components/app/page-header';
import { DocumentLibrary } from '@/components/app/document-library';
import { UploadButton } from '@/components/app/upload-button';
import { AddDocumentsButton } from '@/components/app/add-documents-dialog';
import { CollectionMenu } from '@/components/app/collections-grid';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/misc';

export const metadata = { title: 'Collection' };

export default async function CollectionPage({ params, searchParams }) {
  const user = await requireUser();
  const { id } = await params;
  const sp = await searchParams;
  let collection;
  try {
    collection = await getCollection(user.id, id);
  } catch (err) {
    if (isAppError(err) && err.status === 404) notFound();
    throw err;
  }
  const clean = Object.fromEntries(Object.entries(sp).filter(([k, v]) => typeof v === 'string' && v && k !== 'collectionId'));
  const [result, collections, allDocs] = await Promise.all([
    listDocuments(user.id, { ...clean, collectionId: id }).catch(() => listDocuments(user.id, { collectionId: id })),
    listCollections(user.id),
    prisma.document.findMany({
      where: { userId: user.id, status: { not: 'UPLOADING' } },
      select: { id: true, title: true, fileType: true, collections: { where: { collectionId: id }, select: { collectionId: true } } },
      orderBy: { createdAt: 'desc' },
      take: 500,
    }),
  ]);
  const candidates = allDocs.filter((d) => d.collections.length === 0).map(({ collections: _c, ...d }) => d);

  return (
    <>
      <div className="border-b border-line bg-surface px-4 py-5 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <Link href="/app/collections" className="inline-flex items-center gap-1 text-sm text-ink-2 hover:text-ink">
            <ChevronLeft className="size-4" aria-hidden /> Collections
          </Link>
          <div className="mt-2 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0">
              <h1 className="truncate text-xl font-semibold tracking-[-0.01em] text-ink">{collection.name}</h1>
              <p className="mt-1 text-sm text-ink-2">
                {collection.description || `${collection.documentCount} document${collection.documentCount === 1 ? '' : 's'}`}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button href={`/app/chat?collectionId=${collection.id}`} size="sm" variant={collection.documentCount ? 'primary' : 'secondary'}>
                <MessageSquarePlus /> Ask this collection
              </Button>
              <AddDocumentsButton collectionId={collection.id} candidates={candidates} />
              <UploadButton collectionId={collection.id} variant="secondary" label="Upload here" />
              <CollectionMenu collection={collection} />
            </div>
          </div>
        </div>
      </div>
      <PageBody>
        <DocumentLibrary
          result={result}
          collections={collections}
          params={clean}
          collectionId={collection.id}
          emptyState={
            <EmptyState icon={FolderTree} title="This collection is empty">
              Add documents from your library, or upload new ones straight into this collection.
            </EmptyState>
          }
        />
      </PageBody>
    </>
  );
}
