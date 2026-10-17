'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ListPlus, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';

export function AddDocumentsButton({ collectionId, candidates }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState([]);
  const [filter, setFilter] = useState('');
  const [busy, setBusy] = useState(false);
  const visible = candidates.filter((d) => d.title.toLowerCase().includes(filter.toLowerCase()));

  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => { setSelected([]); setFilter(''); setOpen(true); }}>
        <ListPlus /> Add documents
      </Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="Add documents to this collection"
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              disabled={selected.length === 0}
              loading={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await api(`/api/collections/${collectionId}/documents`, { method: 'POST', body: { documentIds: selected } });
                  toast.success(`Added ${selected.length} document${selected.length === 1 ? '' : 's'}`);
                  setOpen(false);
                  router.refresh();
                } catch (err) {
                  toast.error(err.message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Add {selected.length || ''}
            </Button>
          </>
        }
      >
        {candidates.length === 0 ? (
          <p className="text-sm text-ink-2">Every document in your library is already in this collection.</p>
        ) : (
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
            <ul className="max-h-72 space-y-1 overflow-y-auto">
              {visible.map((d) => {
                const checked = selected.includes(d.id);
                return (
                  <li key={d.id}>
                    <label className={cn('flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2 text-sm', checked ? 'border-ink bg-surface-2' : 'border-line hover:bg-surface-2')}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => setSelected((s) => (checked ? s.filter((x) => x !== d.id) : [...s, d.id]))}
                        className="size-4 accent-[var(--ink)]"
                      />
                      <span className="flex-1 truncate text-ink">{d.title}</span>
                      <span className="text-xs text-ink-3">{d.fileType}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </Dialog>
    </>
  );
}
