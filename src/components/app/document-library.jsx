'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { LayoutGrid, List, Search, Files, FileText, Trash2, FolderPlus, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/field';
import { ConfirmDialog } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/misc';
import { StatusPill, FileTypeBadge } from '@/components/ui/status';
import { MenuRoot, MenuTrigger, MenuContent, MenuItem } from '@/components/ui/menu';
import { useToast } from '@/components/ui/toast';
import { DocumentActions } from '@/components/app/document-actions';
import { ProcessingWatcher } from '@/components/app/processing-watcher';
import { UploadButton } from '@/components/app/upload-button';
import { api } from '@/lib/api';
import { formatBytes } from '@/lib/files';
import { formatDate } from '@/lib/format';
import { cn } from '@/lib/cn';

const SORTS = [
  ['createdAt:desc', 'Newest first'],
  ['createdAt:asc', 'Oldest first'],
  ['title:asc', 'Name A–Z'],
  ['title:desc', 'Name Z–A'],
  ['sizeBytes:desc', 'Largest first'],
  ['sizeBytes:asc', 'Smallest first'],
];

/**
 * Library view. Filters, sort and page live in the URL so views are
 * shareable, survive reloads, and are rendered on the server.
 */
export function DocumentLibrary({ result, collections, params, collectionId, emptyState }) {
  const router = useRouter();
  const pathname = usePathname();
  const toast = useToast();
  const [view, setView] = useState('list');
  const [selected, setSelected] = useState(new Set());
  const [query, setQuery] = useState(params.q || '');
  const [confirmBulk, setConfirmBulk] = useState(false);
  const [busy, setBusy] = useState(false);
  const { documents } = result;

  useEffect(() => {
    try {
      const v = localStorage.getItem('docsy:library-view');
      if (v === 'grid' || v === 'list') setView(v);
    } catch {}
  }, []);
  useEffect(() => setSelected(new Set()), [result]);
  useEffect(() => setQuery(params.q || ''), [params.q]);

  function setParam(updates) {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(updates)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    if (!('page' in updates)) next.delete('page');
    router.push(`${pathname}${next.toString() ? `?${next}` : ''}`);
  }

  function changeView(v) {
    setView(v);
    try {
      localStorage.setItem('docsy:library-view', v);
    } catch {}
  }

  const allSelected = documents.length > 0 && documents.every((d) => selected.has(d.id));
  const toggle = (id) =>
    setSelected((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  const filtersActive = Boolean(params.q || params.type || params.status || params.collectionId);
  const processing = useMemo(() => documents.some((d) => d.status === 'QUEUED' || d.status === 'PROCESSING'), [documents]);

  async function bulkDelete() {
    setBusy(true);
    try {
      const { deleted } = await api('/api/documents/bulk-delete', { method: 'POST', body: { ids: [...selected] } });
      toast.success(`Deleted ${deleted} document${deleted === 1 ? '' : 's'}`);
      setConfirmBulk(false);
      router.refresh();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function bulkAdd(collection) {
    try {
      await api(`/api/collections/${collection.id}/documents`, { method: 'POST', body: { documentIds: [...selected] } });
      toast.success(`Added ${selected.size} to ${collection.name}`);
      setSelected(new Set());
      router.refresh();
    } catch (err) {
      toast.error(err.message);
    }
  }

  return (
    <div>
      <ProcessingWatcher active={processing} />

      {/* Toolbar */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <form
          role="search"
          className="relative flex-1"
          onSubmit={(e) => {
            e.preventDefault();
            setParam({ q: query.trim() });
          }}
        >
          <label className="sr-only" htmlFor="library-search">Search by name or content</label>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" aria-hidden />
          <input
            id="library-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name or text inside documents"
            className="h-9 w-full rounded-md border border-line-strong bg-surface pl-9 pr-9 text-sm text-ink placeholder:text-ink-3 focus:border-ink focus:outline-none"
          />
          {params.q && (
            <button type="button" onClick={() => setParam({ q: '' })} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-3 hover:text-ink" aria-label="Clear search">
              <X className="size-4" />
            </button>
          )}
        </form>
        <div className="flex flex-wrap items-center gap-2">
          <Select aria-label="File type" value={params.type || ''} onChange={(e) => setParam({ type: e.target.value })} className="w-auto">
            <option value="">All types</option>
            <option value="PDF">PDF</option>
            <option value="DOCX">Word</option>
            <option value="TXT">Text</option>
          </Select>
          <Select aria-label="Status" value={params.status || ''} onChange={(e) => setParam({ status: e.target.value })} className="w-auto">
            <option value="">Any status</option>
            <option value="READY">Ready</option>
            <option value="PROCESSING">Processing</option>
            <option value="QUEUED">Queued</option>
            <option value="FAILED">Failed</option>
          </Select>
          {!collectionId && collections.length > 0 && (
            <Select aria-label="Collection" value={params.collectionId || ''} onChange={(e) => setParam({ collectionId: e.target.value })} className="w-auto max-w-44">
              <option value="">All collections</option>
              {collections.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
          )}
          <Select
            aria-label="Sort"
            value={`${params.sort || 'createdAt'}:${params.order || 'desc'}`}
            onChange={(e) => {
              const [sort, order] = e.target.value.split(':');
              setParam({ sort, order });
            }}
            className="w-auto"
          >
            {SORTS.map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </Select>
          <div className="inline-flex rounded-md border border-line bg-surface-2 p-0.5" role="radiogroup" aria-label="View">
            {[
              ['list', List, 'List view'],
              ['grid', LayoutGrid, 'Grid view'],
            ].map(([v, Icon, label]) => (
              <button
                key={v}
                role="radio"
                aria-checked={view === v}
                aria-label={label}
                title={label}
                onClick={() => changeView(v)}
                className={cn('grid size-8 place-items-center rounded-[5px] text-ink-3 hover:text-ink', view === v && 'bg-surface text-ink shadow-sm')}
              >
                <Icon className="size-4" aria-hidden />
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Bulk bar */}
      {selected.size > 0 && (
        <div className="sticky top-2 z-20 mt-4 flex items-center justify-between gap-3 rounded-md border border-ink bg-surface px-3 py-2 shadow-md animate-in">
          <p className="text-sm font-medium text-ink">{selected.size} selected</p>
          <div className="flex items-center gap-2">
            {collections.length > 0 && (
              <MenuRoot>
                <MenuTrigger asChild>
                  <Button variant="secondary" size="sm"><FolderPlus /> Add to collection</Button>
                </MenuTrigger>
                <MenuContent>
                  {collections.map((c) => (
                    <MenuItem key={c.id} onSelect={() => bulkAdd(c)}>{c.name}</MenuItem>
                  ))}
                </MenuContent>
              </MenuRoot>
            )}
            <Button variant="danger" size="sm" onClick={() => setConfirmBulk(true)}><Trash2 /> Delete</Button>
            <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>Clear</Button>
          </div>
        </div>
      )}

      {/* Results */}
      <div className="mt-4">
        {documents.length === 0 ? (
          filtersActive ? (
            <EmptyState icon={Search} title="No documents match" action={<Button variant="secondary" size="sm" onClick={() => router.push(pathname)}>Clear filters</Button>}>
              Try a different search term, or remove filters.
            </EmptyState>
          ) : (
            emptyState || (
              <EmptyState icon={Files} title="Your library is empty" action={<UploadButton label="Upload documents" size="md" />}>
                Upload PDFs, Word documents or text files. Once processed, you can search inside them and ask questions.
              </EmptyState>
            )
          )
        ) : view === 'list' ? (
          <div className="overflow-hidden rounded-lg border border-line bg-surface">
            <table className="w-full text-sm">
              <thead className="border-b border-line bg-surface-2/60 text-left text-xs text-ink-3">
                <tr>
                  <th className="w-10 min-w-11 py-2.5 pl-4">
                    <input
                      type="checkbox"
                      aria-label="Select all documents on this page"
                      checked={allSelected}
                      onChange={() => setSelected(allSelected ? new Set() : new Set(documents.map((d) => d.id)))}
                      className="size-4 accent-[var(--ink)]"
                    />
                  </th>
                  <th className="w-full py-2.5 pr-3 font-medium">Name</th>
                  <th className="hidden whitespace-nowrap py-2.5 pr-3 font-medium md:table-cell">Status</th>
                  <th className="hidden w-48 py-2.5 pr-3 font-medium lg:table-cell">Collections</th>
                  <th className="hidden py-2.5 pr-3 text-right font-medium sm:table-cell">Size</th>
                  <th className="hidden py-2.5 pr-3 font-medium md:table-cell">Added</th>
                  <th className="w-12 py-2.5 pr-2"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {documents.map((d) => (
                  <tr key={d.id} className={cn('group hover:bg-surface-2/50', selected.has(d.id) && 'bg-mark-soft/50')}>
                    <td className="min-w-11 py-2.5 pl-4">
                      <input type="checkbox" aria-label={`Select ${d.title}`} checked={selected.has(d.id)} onChange={() => toggle(d.id)} className="size-4 accent-[var(--ink)]" />
                    </td>
                    <td className="max-w-0 py-2.5 pr-3" style={{ minWidth: 220 }}>
                      <Link href={`/app/documents/${d.id}`} className="flex items-center gap-2.5">
                        <FileTypeBadge type={d.fileType} className="shrink-0" />
                        <span className="min-w-0 truncate font-medium text-ink group-hover:underline">{d.title}</span>
                        {d.isSample && <span className="shrink-0 rounded-sm bg-surface-3 px-1.5 text-[10px] font-medium text-ink-2">Sample</span>}
                      </Link>
                      <div className="mt-1 md:hidden"><StatusPill status={d.status} /></div>
                    </td>
                    <td className="hidden py-2.5 pr-3 md:table-cell"><StatusPill status={d.status} /></td>
                    <td className="hidden w-48 max-w-48 py-2.5 pr-3 lg:table-cell">
                      <span className="block truncate text-xs text-ink-2">{d.collections.map((c) => c.name).join(', ') || '—'}</span>
                    </td>
                    <td className="hidden whitespace-nowrap py-2.5 pr-3 text-right tabular-nums text-ink-2 sm:table-cell">{formatBytes(d.sizeBytes)}</td>
                    <td className="hidden whitespace-nowrap py-2.5 pr-3 text-ink-2 md:table-cell">{formatDate(d.createdAt)}</td>
                    <td className="py-2.5 pr-2 text-right">
                      <DocumentActions document={d} collections={collections} inCollectionId={collectionId} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {documents.map((d) => (
              <li key={d.id} className={cn('group relative flex flex-col rounded-lg border bg-surface p-4 transition-colors hover:border-line-strong', selected.has(d.id) ? 'border-ink' : 'border-line')}>
                <div className="flex items-start justify-between gap-2">
                  <input type="checkbox" aria-label={`Select ${d.title}`} checked={selected.has(d.id)} onChange={() => toggle(d.id)} className="relative z-10 mt-1 size-4 accent-[var(--ink)]" />
                  <div className="relative z-10">
                    <DocumentActions document={d} collections={collections} inCollectionId={collectionId} />
                  </div>
                </div>
                <div className="mt-3 grid h-20 place-items-center rounded-md bg-surface-2">
                  <FileText className="size-7 text-ink-3" aria-hidden />
                </div>
                <Link href={`/app/documents/${d.id}`} className="mt-3 line-clamp-2 text-sm font-medium text-ink after:absolute after:inset-0">
                  {d.title}
                </Link>
                <div className="mt-auto flex items-center justify-between gap-2 pt-3">
                  <StatusPill status={d.status} />
                  <span className="text-xs text-ink-3">{d.fileType} · {formatBytes(d.sizeBytes)}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Pagination */}
      {result.pageCount > 1 && (
        <nav aria-label="Pagination" className="mt-5 flex items-center justify-between text-sm text-ink-2">
          <span>
            Page {result.page} of {result.pageCount}
          </span>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" disabled={result.page <= 1} onClick={() => setParam({ page: String(result.page - 1) })}>
              <ChevronLeft /> Previous
            </Button>
            <Button variant="secondary" size="sm" disabled={result.page >= result.pageCount} onClick={() => setParam({ page: String(result.page + 1) })}>
              Next <ChevronRight />
            </Button>
          </div>
        </nav>
      )}

      <ConfirmDialog
        open={confirmBulk}
        onOpenChange={setConfirmBulk}
        title={`Delete ${selected.size} document${selected.size === 1 ? '' : 's'}?`}
        description="The selected documents, their files, extracted text and search index will be permanently deleted. This can't be undone."
        confirmLabel={`Delete ${selected.size}`}
        loading={busy}
        onConfirm={bulkDelete}
      />
    </div>
  );
}
