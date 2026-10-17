'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/TextLayer.css';
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Highlighter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/misc';

pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();

const normalize = (s) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

/**
 * Renders one PDF page at a time with navigation and zoom. When a citation
 * passage is supplied, text runs on that page that belong to the passage are
 * highlighted in the selectable text layer.
 */
export function PdfViewer({ url, initialPage = 1, highlight }) {
  const [numPages, setNumPages] = useState(null);
  const [page, setPage] = useState(initialPage);
  const [scale, setScale] = useState(1);
  const [width, setWidth] = useState(720);
  const [error, setError] = useState(null);
  const containerRef = useRef(null);

  useEffect(() => setPage(initialPage), [initialPage]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.min(900, entry.contentRect.width - 32)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const passage = useMemo(() => (highlight?.text ? normalize(highlight.text) : null), [highlight]);
  const [hits, setHits] = useState(() => new Set());

  // Locate the cited passage as one contiguous run of text items on the page,
  // so only that run is highlighted (not every occurrence of its words).
  const onText = useCallback(
    ({ items }) => {
      if (!passage || page !== highlight?.page) return setHits(new Set());
      setHits(findPassageItems(items.map((i) => i.str || ''), passage));
    },
    [passage, page, highlight],
  );

  const textRenderer = useCallback(
    ({ str, itemIndex }) => {
      const escaped = str.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
      return hits.has(itemIndex) ? `<mark class="cite-hit">${escaped}</mark>` : escaped;
    },
    [hits],
  );

  const go = (p) => numPages && setPage(Math.min(numPages, Math.max(1, p)));

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-surface px-3 py-2">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon-sm" aria-label="Previous page" disabled={page <= 1} onClick={() => go(page - 1)}>
            <ChevronLeft />
          </Button>
          <label className="flex items-center gap-1.5 text-sm text-ink-2">
            <span className="sr-only">Page</span>
            <input
              type="number"
              min={1}
              max={numPages || 1}
              value={page}
              onChange={(e) => go(Number(e.target.value))}
              className="h-8 w-14 rounded-md border border-line-strong bg-surface px-2 text-center text-sm tabular-nums text-ink focus:border-ink focus:outline-none"
            />
            <span className="tabular-nums">of {numPages ?? '…'}</span>
          </label>
          <Button variant="ghost" size="icon-sm" aria-label="Next page" disabled={!numPages || page >= numPages} onClick={() => go(page + 1)}>
            <ChevronRight />
          </Button>
        </div>
        {highlight && (
          <button
            onClick={() => go(highlight.page)}
            className="inline-flex items-center gap-1.5 rounded-md bg-mark-soft px-2.5 py-1 text-xs font-medium text-ink hover:brightness-95"
          >
            <Highlighter className="size-3.5" aria-hidden /> Cited passage · p. {highlight.page}
          </button>
        )}
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon-sm" aria-label="Zoom out" disabled={scale <= 0.6} onClick={() => setScale((s) => Math.max(0.6, +(s - 0.2).toFixed(1)))}>
            <ZoomOut />
          </Button>
          <span className="w-11 text-center text-xs tabular-nums text-ink-2">{Math.round(scale * 100)}%</span>
          <Button variant="ghost" size="icon-sm" aria-label="Zoom in" disabled={scale >= 2.4} onClick={() => setScale((s) => Math.min(2.4, +(s + 0.2).toFixed(1)))}>
            <ZoomIn />
          </Button>
        </div>
      </div>
      <div ref={containerRef} className="flex-1 overflow-auto bg-surface-2 p-4">
        {error ? (
          <p className="mx-auto max-w-md py-16 text-center text-sm text-ink-2">
            This PDF couldn't be displayed in the browser. You can still <a className="underline" href={`${url}?download=1`}>download the original</a>.
          </p>
        ) : (
          <Document
            file={url}
            onLoadSuccess={({ numPages: n }) => {
              setNumPages(n);
              setPage((p) => Math.min(Math.max(1, p), n));
            }}
            onLoadError={setError}
            loading={<div className="grid place-items-center py-24"><Spinner label="Loading PDF" /></div>}
            className="flex justify-center"
          >
            <Page
              pageNumber={page}
              width={width * scale}
              renderAnnotationLayer={false}
              customTextRenderer={textRenderer}
              onGetTextSuccess={onText}
              className="shadow-md"
              loading={<div className="grid place-items-center py-24"><Spinner label="Rendering page" /></div>}
            />
          </Document>
        )}
      </div>
    </div>
  );
}

/**
 * Returns the indices of text items covering the passage. Matches the start
 * and end of the passage independently, so small extraction differences in
 * the middle don't prevent highlighting.
 */
export function findPassageItems(strings, passage) {
  const ranges = [];
  let joined = '';
  strings.forEach((s, i) => {
    const n = normalize(s);
    if (!n) return;
    if (joined) joined += ' ';
    ranges.push({ i, start: joined.length, end: joined.length + n.length });
    joined += n;
  });
  const probe = Math.min(60, passage.length);
  const start = joined.indexOf(passage.slice(0, probe));
  if (start === -1) return new Set();
  const tail = passage.slice(-probe);
  const tailAt = joined.indexOf(tail, start);
  const end = tailAt === -1 ? Math.min(joined.length, start + passage.length) : tailAt + tail.length;
  return new Set(ranges.filter((r) => r.end > start && r.start < end).map((r) => r.i));
}
