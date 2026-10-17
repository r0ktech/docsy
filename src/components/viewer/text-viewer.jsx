'use client';
import { useEffect, useRef, useState } from 'react';
import { Highlighter } from 'lucide-react';
import { Spinner } from '@/components/ui/misc';
import { api } from '@/lib/api';

/**
 * Extracted-text reader for DOCX and TXT documents (and a text fallback for
 * PDFs). Highlights the cited character range and scrolls it into view.
 */
export function TextViewer({ documentId, highlight }) {
  const [segments, setSegments] = useState(null);
  const [error, setError] = useState(null);
  const markRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    api(`/api/documents/${documentId}/text`)
      .then((r) => !cancelled && setSegments(r.segments))
      .catch((e) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [documentId]);

  useEffect(() => {
    if (segments && markRef.current) markRef.current.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [segments, highlight]);

  if (error) return <p className="p-8 text-sm text-danger">{error}</p>;
  if (!segments) return <div className="grid place-items-center py-24"><Spinner label="Loading text" /></div>;

  return (
    <div className="h-full overflow-auto bg-surface-2 p-4">
      {highlight && (
        <button
          onClick={() => markRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })}
          className="sticky top-0 z-10 mx-auto mb-3 flex items-center gap-1.5 rounded-md bg-mark-soft px-2.5 py-1 text-xs font-medium text-ink shadow-sm"
        >
          <Highlighter className="size-3.5" aria-hidden /> Jump to cited passage
        </button>
      )}
      <article className="mx-auto max-w-[68ch] rounded-md bg-surface px-6 py-8 shadow-sm sm:px-10">
        {segments.map((s) => {
          const hl = highlight && highlight.segment === s.number ? highlight : null;
          return (
            <div key={s.number} className="whitespace-pre-wrap font-serif text-[1.02rem] leading-[1.8] text-ink">
              {segments.length > 1 && <p className="mb-2 font-sans text-xs text-ink-3">Page {s.number}</p>}
              {hl ? (
                <>
                  {s.text.slice(0, hl.start)}
                  <mark ref={markRef} className="mark rounded-sm bg-transparent text-ink">{s.text.slice(hl.start, hl.end)}</mark>
                  {s.text.slice(hl.end)}
                </>
              ) : (
                s.text
              )}
            </div>
          );
        })}
      </article>
    </div>
  );
}
