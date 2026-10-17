import { route } from '@/server/http';
import { getOwnedDocument, markOpened } from '@/server/services/documents';
import { getStorage } from '@/server/storage';
import { idSchema } from '@/lib/validation';

/** Streams the original file to its owner. Never cached by shared caches. */
export const GET = route(async (request, { user, params }) => {
  const doc = await getOwnedDocument(user.id, idSchema.parse(params.id));
  const { stream, size } = await getStorage().getObjectStream(doc.storageKey);
  const download = new URL(request.url).searchParams.get('download') === '1';
  if (!download) await markOpened(user.id, doc.id);
  const asciiName = doc.filename.replace(/[^\x20-\x7e]/g, '_').replace(/"/g, '');
  return new Response(stream, {
    headers: {
      'Content-Type': doc.mimeType,
      ...(size ? { 'Content-Length': String(size) } : {}),
      'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(doc.filename)}`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      // Uploaded content is never executed as a page. (Browsers' built-in PDF
      // viewers break under a sandbox CSP, and PDFs cannot run page scripts anyway.)
      ...(doc.fileType === 'PDF' ? {} : { 'Content-Security-Policy': "default-src 'none'; sandbox" }),
    },
  });
});
