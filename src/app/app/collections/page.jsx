import { requireUser } from '@/server/auth/session';
import { listCollections } from '@/server/services/collections';
import { PageHeader, PageBody } from '@/components/app/page-header';
import { CollectionsGrid, NewCollectionButton } from '@/components/app/collections-grid';

export const metadata = { title: 'Collections' };

export default async function CollectionsPage() {
  const user = await requireUser();
  const collections = await listCollections(user.id);
  return (
    <>
      <PageHeader
        title="Collections"
        description="Group related documents, then ask questions across the whole group."
        actions={<NewCollectionButton />}
      />
      <PageBody>
        <CollectionsGrid collections={collections} />
      </PageBody>
    </>
  );
}
