'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FolderPlus, FolderTree, MoreHorizontal, Pencil, Trash2, MessageSquarePlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/misc';
import { ConfirmDialog } from '@/components/ui/dialog';
import { MenuRoot, MenuTrigger, MenuContent, MenuItem, MenuSeparator } from '@/components/ui/menu';
import { useToast } from '@/components/ui/toast';
import { CollectionFormDialog } from '@/components/app/collection-form-dialog';
import { api } from '@/lib/api';
import { timeAgo } from '@/lib/format';

export function NewCollectionButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <FolderPlus /> New collection
      </Button>
      <CollectionFormDialog open={open} onOpenChange={setOpen} />
    </>
  );
}

export function CollectionsGrid({ collections }) {
  const [creating, setCreating] = useState(false);
  if (collections.length === 0) {
    return (
      <>
        <EmptyState icon={FolderTree} title="No collections yet" action={<Button onClick={() => setCreating(true)}><FolderPlus /> Create a collection</Button>}>
          Collections let you ask one question across a set of related documents — a project, a case, a course.
        </EmptyState>
        <CollectionFormDialog open={creating} onOpenChange={setCreating} />
      </>
    );
  }
  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {collections.map((c) => (
        <CollectionCard key={c.id} collection={c} />
      ))}
    </ul>
  );
}

export function CollectionMenu({ collection, afterDelete }) {
  const router = useRouter();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <>
      <MenuRoot>
        <MenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${collection.name}`}>
            <MoreHorizontal />
          </Button>
        </MenuTrigger>
        <MenuContent>
          <MenuItem icon={MessageSquarePlus} disabled={collection.documentCount === 0} onSelect={() => router.push(`/app/chat?collectionId=${collection.id}`)}>
            Ask this collection
          </MenuItem>
          <MenuItem icon={Pencil} onSelect={() => setEditing(true)}>Rename or edit</MenuItem>
          <MenuSeparator />
          <MenuItem icon={Trash2} danger onSelect={() => setDeleting(true)}>Delete collection</MenuItem>
        </MenuContent>
      </MenuRoot>
      <CollectionFormDialog open={editing} onOpenChange={setEditing} collection={collection} />
      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={`Delete “${collection.name}”?`}
        description="The collection is removed, but its documents stay in your library. Conversations scoped to it will no longer have a scope."
        confirmLabel="Delete collection"
        loading={busy}
        onConfirm={async () => {
          setBusy(true);
          try {
            await api(`/api/collections/${collection.id}`, { method: 'DELETE' });
            toast.success('Collection deleted');
            setDeleting(false);
            if (afterDelete) afterDelete();
            router.refresh();
          } catch (err) {
            toast.error(err.message);
          } finally {
            setBusy(false);
          }
        }}
      />
    </>
  );
}

function CollectionCard({ collection: c }) {
  return (
    <li className="group relative flex flex-col rounded-lg border border-line bg-surface p-4 transition-colors hover:border-line-strong">
      <div className="flex items-start justify-between gap-2">
        <div className="grid size-9 place-items-center rounded-md bg-surface-2 text-ink-2">
          <FolderTree className="size-4" aria-hidden />
        </div>
        <div className="relative z-10">
          <CollectionMenu collection={c} />
        </div>
      </div>
      <Link href={`/app/collections/${c.id}`} className="mt-3 truncate font-medium text-ink after:absolute after:inset-0">
        {c.name}
      </Link>
      {c.description && <p className="mt-1 line-clamp-2 text-sm text-ink-2">{c.description}</p>}
      <p className="mt-auto pt-3 text-xs text-ink-3">
        {c.documentCount} document{c.documentCount === 1 ? '' : 's'} · updated {timeAgo(c.updatedAt)}
      </p>
    </li>
  );
}
