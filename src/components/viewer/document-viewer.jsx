'use client';
import dynamic from 'next/dynamic';
import { useState } from 'react';
import { Spinner } from '@/components/ui/misc';
import { TextViewer } from '@/components/viewer/text-viewer';
import { cn } from '@/lib/cn';

const PdfViewer = dynamic(() => import('@/components/viewer/pdf-viewer').then((m) => m.PdfViewer), {
  ssr: false,
  loading: () => <div className="grid place-items-center py-24"><Spinner label="Loading viewer" /></div>,
});

export function DocumentViewer({ document: doc, highlight, initialPage = 1, className }) {
  const canShowText = doc.status === 'READY';
  const [mode, setMode] = useState(doc.fileType === 'PDF' ? 'pdf' : 'text');

  return (
    <div className={cn('flex h-full min-h-[70vh] flex-col overflow-hidden rounded-lg border border-line bg-surface', className)}>
      {doc.fileType === 'PDF' && canShowText && (
        <div role="tablist" aria-label="Viewer mode" className="flex gap-1 border-b border-line px-3 pt-2">
          {[
            ['pdf', 'Original'],
            ['text', 'Extracted text'],
          ].map(([m, label]) => (
            <button
              key={m}
              role="tab"
              aria-selected={mode === m}
              onClick={() => setMode(m)}
              className={cn('-mb-px border-b-2 px-3 pb-2 text-sm', mode === m ? 'border-ink font-medium text-ink' : 'border-transparent text-ink-2 hover:text-ink')}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      <div className="min-h-0 flex-1">
        {mode === 'pdf' ? (
          <PdfViewer url={`/api/documents/${doc.id}/file`} initialPage={initialPage} highlight={highlight?.page ? highlight : null} />
        ) : canShowText ? (
          <TextViewer documentId={doc.id} highlight={highlight} />
        ) : (
          <p className="p-8 text-sm text-ink-2">The text preview will be available once processing finishes.</p>
        )}
      </div>
    </div>
  );
}
