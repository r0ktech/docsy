'use client';
import { useMemo, useState } from 'react';
import { Library, FolderTree, FileText, Check, ChevronDown, Search } from 'lucide-react';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';

export function scopeLabel(scope, { collections = [], documents = [] } = {}) {
  if (!scope || scope.type === 'LIBRARY') return 'All documents';
  if (scope.type === 'COLLECTION') return collections.find((c) => c.id === scope.collectionId)?.name || 'Collection';
  const n = scope.documentIds.length;
  if (n === 1) return documents.find((d) => d.id === scope.documentIds[0])?.title || '1 document';
  return `${n} documents`;
}

/**
 * Chooses what a conversation searches: the whole library, one collection, or
 * a hand-picked set of documents. Only READY documents can be selected.
 */
export function ScopePicker({ value, onChange, collections, documents, disabled }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const [tab, setTab] = useState(value.type);
  const [filter, setFilter] = useState('');

  const readyDocs = useMemo(
    () => documents.filter((d) => d.status === 'READY' && d.title.toLowerCase().includes(filter.toLowerCase())),
    [documents, filter],
  );

  function openPicker() {
    setDraft(value);
    setTab(value.type);
    setFilter('');
    setOpen(true);
  }

  const selectedIds = draft.type === 'DOCUMENTS' ? draft.documentIds : [];
  const Icon = value.type === 'LIBRARY' ? Library : value.type === 'COLLECTION' ? FolderTree : FileText;
  const canApply = draft.type === 'LIBRARY' || (draft.type === 'COLLECTION' && draft.collectionId) || selectedIds.length > 0;

  return (
    <>
      <button
        type="button"
        onClick={openPicker}
        disabled={disabled}
        className="inline-flex h-8 max-w-full items-center gap-1.5 rounded-md border border-line bg-surface-2 px-2.5 text-xs font-medium text-ink-2 hover:text-ink disabled:opacity-50"
        aria-label={`Search scope: ${scopeLabel(value, { collections, documents })}. Change scope`}
      >
        <Icon className="size-3.5 shrink-0" aria-hidden />
        <span className="truncate">{scopeLabel(value, { collections, documents })}</span>
        <ChevronDown className="size-3.5 shrink-0" aria-hidden />
      </button>

      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="What should Docsy search?"
        description="Answers will only use documents in this scope."
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              disabled={!canApply}
              onClick={() => {
                onChange(draft);
                setOpen(false);
              }}
            >
              Use this scope
            </Button>
          </>
        }
      >
        <div role="tablist" aria-label="Scope type" className="mb-4 grid grid-cols-3 gap-1 rounded-md bg-surface-2 p-1">
          {[
            ['LIBRARY', 'Everything', Library],
            ['COLLECTION', 'A collection', FolderTree],
            ['DOCUMENTS', 'Specific documents', FileText],
          ].map(([t, label, TabIcon]) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              onClick={() => {
                setTab(t);
                if (t === 'LIBRARY') setDraft({ type: 'LIBRARY' });
                if (t === 'COLLECTION') setDraft(value.type === 'COLLECTION' ? value : { type: 'COLLECTION', collectionId: null });
                if (t === 'DOCUMENTS') setDraft(value.type === 'DOCUMENTS' ? value : { type: 'DOCUMENTS', documentIds: [] });
              }}
              className={cn('flex items-center justify-center gap-1.5 rounded-[5px] px-2 py-1.5 text-xs font-medium text-ink-2', tab === t && 'bg-surface text-ink shadow-sm')}
            >
              <TabIcon className="size-3.5" aria-hidden />
              <span className="truncate">{label}</span>
            </button>
          ))}
        </div>

        {tab === 'LIBRARY' && (
          <p className="rounded-md bg-surface-2 px-3 py-3 text-sm text-ink-2">
            Search all {documents.filter((d) => d.status === 'READY').length} ready documents in your library.
          </p>
        )}

        {tab === 'COLLECTION' &&
          (collections.length === 0 ? (
            <p className="text-sm text-ink-2">You don't have any collections yet. Create one from the Collections page.</p>
          ) : (
            <ul role="radiogroup" className="max-h-72 space-y-1 overflow-y-auto">
              {collections.map((c) => {
                const checked = draft.type === 'COLLECTION' && draft.collectionId === c.id;
                return (
                  <li key={c.id}>
                    <button
                      role="radio"
                      aria-checked={checked}
                      onClick={() => setDraft({ type: 'COLLECTION', collectionId: c.id })}
                      className={cn('flex w-full items-center gap-3 rounded-md border px-3 py-2.5 text-left text-sm', checked ? 'border-ink bg-surface-2' : 'border-line hover:bg-surface-2')}
                    >
                      <FolderTree className="size-4 text-ink-3" aria-hidden />
                      <span className="flex-1 truncate text-ink">{c.name}</span>
                      <span className="text-xs text-ink-3">{c.documentCount} docs</span>
                      {checked && <Check className="size-4 text-ink" aria-hidden />}
                    </button>
                  </li>
                );
              })}
            </ul>
          ))}

        {tab === 'DOCUMENTS' && (
          <>
            <label className="relative mb-2 block">
              <span className="sr-only">Filter documents</span>
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-ink-3" aria-hidden />
              <input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Filter by title"
                className="h-9 w-full rounded-md border border-line-strong bg-surface pl-8 pr-3 text-sm focus:border-ink focus:outline-none"
              />
            </label>
            {readyDocs.length === 0 ? (
              <p className="py-4 text-sm text-ink-2">No ready documents match.</p>
            ) : (
              <ul className="max-h-64 space-y-1 overflow-y-auto">
                {readyDocs.map((d) => {
                  const checked = selectedIds.includes(d.id);
                  return (
                    <li key={d.id}>
                      <label className={cn('flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2 text-sm', checked ? 'border-ink bg-surface-2' : 'border-line hover:bg-surface-2')}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() =>
                            setDraft({
                              type: 'DOCUMENTS',
                              documentIds: checked ? selectedIds.filter((x) => x !== d.id) : [...selectedIds, d.id].slice(0, 50),
                            })
                          }
                          className="size-4 accent-[var(--ink)]"
                        />
                        <span className="flex-1 truncate text-ink">{d.title}</span>
                        <span className="text-xs text-ink-3">{d.fileType}</span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
            <p className="mt-2 text-xs text-ink-3">{selectedIds.length} selected</p>
          </>
        )}
      </Dialog>
    </>
  );
}
