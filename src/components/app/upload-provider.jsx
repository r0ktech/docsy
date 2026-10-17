'use client';
import { createContext, useCallback, useContext, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { UploadCloud, FileText, CheckCircle2, X } from 'lucide-react';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { api, ApiError } from '@/lib/api';
import { ACCEPT_ATTRIBUTE, fileTypeFromName, formatBytes } from '@/lib/files';
import { cn } from '@/lib/cn';

const UploadContext = createContext(null);

export function useUpload() {
  const ctx = useContext(UploadContext);
  if (!ctx) throw new Error('useUpload must be used inside UploadProvider');
  return ctx;
}

/** Retries once after a dropped connection; other errors surface immediately. */
async function withNetworkRetry(fn) {
  try {
    return await fn();
  } catch (err) {
    if (err.code !== 'NETWORK_ERROR') throw err;
    await new Promise((r) => setTimeout(r, 1500));
    return fn();
  }
}

async function sha256Hex(file) {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

function putWithProgress({ url, method, headers }, file, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, url);
    for (const [k, v] of Object.entries(headers || {})) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolve();
      let message = 'The upload failed. Try again.';
      try {
        message = JSON.parse(xhr.responseText).error?.message || message;
      } catch {}
      reject(new ApiError(xhr.status, 'UPLOAD_FAILED', message));
    };
    xhr.onerror = () => reject(new ApiError(0, 'NETWORK_ERROR', 'The connection dropped during upload. Try again.'));
    xhr.send(file);
  });
}

/**
 * Global upload dialog and queue. Upload flow per file:
 *   hash → reserve (/api/uploads) → PUT bytes (presigned S3 or local route)
 *   → complete (/api/uploads/:id/complete, server verifies bytes) → queued.
 */
export function UploadProvider({ limits, children }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [dragging, setDragging] = useState(false);
  const optionsRef = useRef({});
  const inputRef = useRef(null);

  const openUpload = useCallback((options = {}) => {
    optionsRef.current = options;
    setOpen(true);
  }, []);

  const update = (id, patch) => setItems((list) => list.map((i) => (i.id === id ? { ...i, ...patch } : i)));

  async function uploadOne(item) {
    const { file, id } = item;
    try {
      update(id, { stage: 'checking' });
      const sha256 = await sha256Hex(file);
      const reservation = await withNetworkRetry(() =>
        api('/api/uploads', { method: 'POST', body: { filename: file.name, size: file.size, sha256 } }),
      );
      update(id, { stage: 'uploading', progress: 0 });
      await withNetworkRetry(() => putWithProgress(reservation.upload, file, (p) => update(id, { progress: p })));
      update(id, { stage: 'verifying', progress: 1 });
      const { document } = await withNetworkRetry(() => api(`/api/uploads/${reservation.document.id}/complete`, { method: 'POST' }));
      const collectionId = optionsRef.current.collectionId;
      if (collectionId) {
        await api(`/api/collections/${collectionId}/documents`, { method: 'POST', body: { documentIds: [document.id] } }).catch(() => {});
      }
      update(id, { stage: 'done', documentId: document.id });
      router.refresh();
    } catch (err) {
      update(id, {
        stage: 'error',
        error: err.message,
        duplicateOf: err.code === 'DUPLICATE_DOCUMENT' ? err.details?.documentId : undefined,
      });
    }
  }

  function addFiles(fileList) {
    const next = Array.from(fileList).map((file) => {
      const id = Math.random().toString(36).slice(2);
      let error;
      if (!fileTypeFromName(file.name)) error = 'Only PDF, DOCX and TXT files are supported.';
      else if (file.size === 0) error = 'This file is empty.';
      else if (file.size > limits.maxUploadBytes) error = `Larger than the ${formatBytes(limits.maxUploadBytes)} limit.`;
      return { id, file, stage: error ? 'error' : 'pending', progress: 0, error };
    });
    setItems((list) => [...next, ...list]);
    // Upload sequentially so limits and duplicate checks stay predictable.
    (async () => {
      for (const item of next.filter((i) => i.stage === 'pending')) await uploadOne(item);
    })();
  }

  const busy = items.some((i) => ['pending', 'checking', 'uploading', 'verifying'].includes(i.stage));

  return (
    <UploadContext.Provider value={{ openUpload }}>
      {children}
      <Dialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o && !busy) setItems((list) => list.filter((i) => i.stage !== 'done' && i.stage !== 'error'));
        }}
        title="Upload documents"
        description={`PDF, DOCX or TXT · up to ${formatBytes(limits.maxUploadBytes)} each`}
        size="lg"
      >
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
          }}
          className={cn(
            'flex flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-10 text-center transition-colors',
            dragging ? 'border-ink bg-mark-soft' : 'border-line-strong bg-surface-2/50',
          )}
        >
          <UploadCloud className="size-7 text-ink-2" aria-hidden />
          <p className="mt-3 text-sm font-medium text-ink">Drag files here</p>
          <p className="mt-1 text-xs text-ink-3">or</p>
          <Button variant="secondary" size="sm" className="mt-2" onClick={() => inputRef.current?.click()}>
            Choose files
          </Button>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept={ACCEPT_ATTRIBUTE}
            className="sr-only"
            aria-label="Choose files to upload"
            onChange={(e) => {
              if (e.target.files?.length) addFiles(e.target.files);
              e.target.value = '';
            }}
          />
        </div>

        {items.length > 0 && (
          <ul className="mt-4 max-h-72 space-y-2 overflow-y-auto" aria-live="polite">
            {items.map((item) => (
              <UploadRow key={item.id} item={item} onDismiss={() => setItems((l) => l.filter((i) => i.id !== item.id))} onNavigate={() => setOpen(false)} />
            ))}
          </ul>
        )}
        <p className="mt-4 text-xs leading-relaxed text-ink-3">
          After upload, Docsy extracts the text and indexes it for search. Scanned PDFs without selectable text can't
          be processed yet.
        </p>
      </Dialog>
    </UploadContext.Provider>
  );
}

const STAGE_LABEL = {
  pending: 'Waiting…',
  checking: 'Preparing…',
  uploading: 'Uploading',
  verifying: 'Verifying…',
  done: 'Uploaded — processing has started',
};

function UploadRow({ item, onDismiss, onNavigate }) {
  const { file, stage, progress, error, duplicateOf, documentId } = item;
  return (
    <li className="rounded-md border border-line bg-surface px-3 py-2.5">
      <div className="flex items-center gap-3">
        <FileText className="size-4 shrink-0 text-ink-3" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-ink">{file.name}</p>
          <p className={cn('text-xs', stage === 'error' ? 'text-danger' : 'text-ink-3')}>
            {stage === 'error' ? error : stage === 'uploading' ? `Uploading · ${Math.round(progress * 100)}%` : STAGE_LABEL[stage]}
            {' · '}
            {formatBytes(file.size)}
          </p>
        </div>
        {stage === 'done' && documentId && (
          <Link href={`/app/documents/${documentId}`} onClick={onNavigate} className="text-xs font-medium text-ink underline underline-offset-2">
            View
          </Link>
        )}
        {stage === 'error' && duplicateOf && (
          <Link href={`/app/documents/${duplicateOf}`} onClick={onNavigate} className="text-xs font-medium text-ink underline underline-offset-2">
            Open existing
          </Link>
        )}
        {stage === 'done' ? (
          <CheckCircle2 className="size-4 text-success" aria-label="Uploaded" />
        ) : stage === 'error' ? (
          <button onClick={onDismiss} aria-label={`Dismiss ${file.name}`} className="text-ink-3 hover:text-ink">
            <X className="size-4" />
          </button>
        ) : null}
      </div>
      {['uploading', 'verifying', 'checking'].includes(stage) && (
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-surface-3">
          <div
            className={cn('h-full rounded-full bg-ink transition-[width] duration-200', stage !== 'uploading' && 'animate-pulse')}
            style={{ width: `${stage === 'checking' ? 5 : Math.max(5, progress * 100)}%` }}
          />
        </div>
      )}
    </li>
  );
}
