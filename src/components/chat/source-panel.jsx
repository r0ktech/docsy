'use client';
import { useEffect, useState } from 'react';
import { X, ExternalLink, Quote } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/misc';
import { DocumentViewer } from '@/components/viewer/document-viewer';
import { api } from '@/lib/api';

export function citationHref(c) {
  const params = new URLSearchParams();
  if (c.pageNumber) params.set('page', String(c.pageNumber));
  if (c.segmentNumber != null && c.charStart != null && c.charEnd != null) {
    params.set('seg', String(c.segmentNumber));
    params.set('start', String(c.charStart));
    params.set('end', String(c.charEnd));
  }
  return `/app/documents/${c.documentId}?${params}`;
}

/**
 * Opens a cited source beside the conversation: the excerpt, then the
 * document itself at the cited page with the passage highlighted.
 */
export function SourcePanel({ citation, onClose }) {
  const [doc, setDoc] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    setDoc(null);
    setError(null);
    if (!citation?.documentId) return;
    let cancelled = false;
    api(`/api/documents/${citation.documentId}`)
      .then((r) => !cancelled && setDoc(r.document))
      .catch((e) => !cancelled && setError(e.status === 404 ? 'This document has been deleted.' : e.message));
    return () => {
      cancelled = true;
    };
  }, [citation?.documentId, citation?.id]);

  useEffect(() => {
    if (!citation) return;
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [citation, onClose]);

  if (!citation) return null;

  const highlight =
    citation.segmentNumber != null && citation.charStart != null
      ? {
          segment: citation.segmentNumber,
          start: citation.charStart,
          end: citation.charEnd,
          page: citation.pageNumber,
          text: citation.excerpt.replace(/^…|…$/g, ''),
        }
      : null;

  return (
    <aside
      aria-label="Source"
      className="fixed inset-0 z-40 flex flex-col bg-surface animate-in lg:static lg:inset-auto lg:z-auto lg:min-h-0 lg:w-[46%] lg:max-w-[760px] lg:border-l lg:border-line"
    >
      <div className="flex shrink-0 items-center gap-2 border-b border-line px-4 py-2.5">
        <span className="grid size-5 shrink-0 place-items-center rounded bg-mark text-[0.65rem] font-semibold text-mark-ink">{citation.sourceIndex}</span>
        <p className="min-w-0 flex-1 truncate text-sm font-medium text-ink">
          {citation.documentName}
          {citation.pageNumber ? <span className="font-normal text-ink-3"> · page {citation.pageNumber}</span> : null}
        </p>
        {citation.documentId && (
          <Button href={citationHref(citation)} variant="ghost" size="xs" title="Open full document">
            <ExternalLink /> <span className="hidden sm:inline">Open</span>
          </Button>
        )}
        <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close source">
          <X />
        </Button>
      </div>

      <div className="max-h-32 shrink-0 overflow-y-auto border-b border-line bg-mark-soft/40 px-4 py-3">
        <p className="flex gap-2 font-serif text-[0.95rem] leading-relaxed text-ink">
          <Quote className="mt-1 size-3.5 shrink-0 text-ink-3" aria-hidden />
          <span>{citation.excerpt}</span>
        </p>
      </div>

      <div className="flex min-h-0 flex-1 flex-col p-3">
        {!citation.documentId || error ? (
          <p className="p-6 text-sm text-ink-2">{error || 'This document has been deleted. The quoted excerpt above was saved with the answer.'}</p>
        ) : !doc ? (
          <div className="grid place-items-center py-24"><Spinner label="Loading document" /></div>
        ) : (
          <DocumentViewer key={citation.id} document={doc} highlight={highlight} initialPage={citation.pageNumber || 1} className="min-h-0" />
        )}
      </div>
    </aside>
  );
}
