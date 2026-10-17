import { requireUser } from '@/server/auth/session';
import { listDocuments } from '@/server/services/documents';
import { listCollections } from '@/server/services/collections';
import { PageHeader, PageBody } from '@/components/app/page-header';
import { DocumentLibrary } from '@/components/app/document-library';
import { UploadButton } from '@/components/app/upload-button';

export const metadata = { title: 'My documents' };

export default async function DocumentsPage({ searchParams }) {
  const user = await requireUser();
  const params = await searchParams;
  const clean = Object.fromEntries(Object.entries(params).filter(([, v]) => typeof v === 'string' && v));
  let result;
  try {
    result = await listDocuments(user.id, clean);
  } catch {
    result = await listDocuments(user.id, {});
  }
  const collections = await listCollections(user.id);
  return (
    <>
      <PageHeader
        title="My documents"
        description={`${result.total} document${result.total === 1 ? '' : 's'}${clean.q ? ` matching “${clean.q}”` : ''}`}
        actions={<UploadButton />}
      />
      <PageBody>
        <DocumentLibrary result={result} collections={collections} params={clean} />
      </PageBody>
    </>
  );
}
