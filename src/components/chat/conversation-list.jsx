'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Search, MessagesSquare, MoreHorizontal, Pencil, Trash2, Library, FolderTree, FileText, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/misc';
import { ConfirmDialog, Dialog } from '@/components/ui/dialog';
import { Field, Input } from '@/components/ui/field';
import { MenuRoot, MenuTrigger, MenuContent, MenuItem, MenuSeparator } from '@/components/ui/menu';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/api';
import { timeAgo } from '@/lib/format';

export function ConversationList({ initial, initialCursor, query }) {
  const router = useRouter();
  const toast = useToast();
  const [items, setItems] = useState(initial);
  const [cursor, setCursor] = useState(initialCursor);
  const [q, setQ] = useState(query);
  const [loadingMore, setLoadingMore] = useState(false);
  const [renaming, setRenaming] = useState(null);
  const [draft, setDraft] = useState('');
  const [deleting, setDeleting] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setItems(initial);
    setCursor(initialCursor);
  }, [initial, initialCursor]);

  async function loadMore() {
    setLoadingMore(true);
    try {
      const params = new URLSearchParams({ cursor });
      if (query) params.set('q', query);
      const res = await api(`/api/conversations?${params}`);
      setItems((list) => [...list, ...res.conversations]);
      setCursor(res.nextCursor);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <div>
      <form
        role="search"
        className="relative max-w-md"
        onSubmit={(e) => {
          e.preventDefault();
          router.push(`/app/chats${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ''}`);
        }}
      >
        <label htmlFor="chat-search" className="sr-only">Search conversations</label>
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" aria-hidden />
        <input
          id="chat-search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search titles, questions and answers"
          className="h-9 w-full rounded-md border border-line-strong bg-surface pl-9 pr-9 text-sm text-ink placeholder:text-ink-3 focus:border-ink focus:outline-none"
        />
        {query && (
          <button type="button" onClick={() => router.push('/app/chats')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-3 hover:text-ink" aria-label="Clear search">
            <X className="size-4" />
          </button>
        )}
      </form>

      <div className="mt-4">
        {items.length === 0 ? (
          query ? (
            <EmptyState icon={Search} title="No conversations match">Try different words.</EmptyState>
          ) : (
            <EmptyState icon={MessagesSquare} title="No conversations yet" action={<Button href="/app/chat">Start a conversation</Button>}>
              Ask a question about your documents and the conversation will be saved here.
            </EmptyState>
          )
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
            {items.map((c) => {
              const Icon = c.scopeType === 'LIBRARY' ? Library : c.scopeType === 'COLLECTION' ? FolderTree : FileText;
              const scope =
                c.scopeType === 'LIBRARY'
                  ? 'All documents'
                  : c.scopeType === 'COLLECTION'
                    ? c.collection?.name || 'Deleted collection'
                    : c._count.documents === 1
                      ? c.document?.title || '1 document'
                      : `${c._count.documents} documents`;
              return (
                <li key={c.id} className="group relative flex items-center gap-3 px-4 py-3 hover:bg-surface-2/50">
                  <MessagesSquare className="size-4 shrink-0 text-ink-3" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <Link href={`/app/chat/${c.id}`} className="block truncate text-sm font-medium text-ink after:absolute after:inset-0">
                      {c.title}
                    </Link>
                    <p className="flex items-center gap-1.5 truncate text-xs text-ink-3">
                      <Icon className="size-3 shrink-0" aria-hidden />
                      <span className="truncate">{scope}</span>
                      <span aria-hidden>·</span>
                      <span>{Math.ceil(c._count.messages / 2)} question{c._count.messages > 2 ? 's' : ''}</span>
                    </p>
                  </div>
                  <span className="hidden text-xs text-ink-3 sm:block">{timeAgo(c.lastMessageAt)}</span>
                  <div className="relative z-10">
                    <MenuRoot>
                      <MenuTrigger asChild>
                        <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${c.title}`}>
                          <MoreHorizontal />
                        </Button>
                      </MenuTrigger>
                      <MenuContent>
                        <MenuItem icon={Pencil} onSelect={() => { setDraft(c.title); setRenaming(c); }}>Rename</MenuItem>
                        <MenuSeparator />
                        <MenuItem icon={Trash2} danger onSelect={() => setDeleting(c)}>Delete</MenuItem>
                      </MenuContent>
                    </MenuRoot>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {cursor && (
          <div className="mt-4 flex justify-center">
            <Button variant="secondary" size="sm" loading={loadingMore} onClick={loadMore}>Load more</Button>
          </div>
        )}
      </div>

      <Dialog open={Boolean(renaming)} onOpenChange={(o) => !o && setRenaming(null)} title="Rename conversation" size="sm">
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              const res = await api(`/api/conversations/${renaming.id}`, { method: 'PATCH', body: { title: draft } });
              setItems((list) => list.map((x) => (x.id === renaming.id ? { ...x, title: res.title } : x)));
              setRenaming(null);
              router.refresh();
            } catch (err) {
              toast.error(err.message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <Field label="Title">{(p) => <Input {...p} value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={120} autoFocus />}</Field>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setRenaming(null)}>Cancel</Button>
            <Button type="submit" loading={busy} disabled={!draft.trim()}>Save</Button>
          </div>
        </form>
      </Dialog>

      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Delete this conversation?"
        description={`“${deleting?.title}” and all its answers and citations will be permanently deleted.`}
        confirmLabel="Delete"
        loading={busy}
        onConfirm={async () => {
          setBusy(true);
          try {
            await api(`/api/conversations/${deleting.id}`, { method: 'DELETE' });
            setItems((list) => list.filter((x) => x.id !== deleting.id));
            setDeleting(null);
            toast.success('Conversation deleted');
            router.refresh();
          } catch (err) {
            toast.error(err.message);
          } finally {
            setBusy(false);
          }
        }}
      />
    </div>
  );
}
