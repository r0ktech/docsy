'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  MoreHorizontal,
  ExternalLink,
  MessageSquarePlus,
  Pencil,
  FolderPlus,
  Download,
  RotateCw,
  Trash2,
  FolderMinus,
  Check,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MenuRoot, MenuTrigger, MenuContent, MenuItem, MenuSeparator, MenuSub, MenuSubTrigger, MenuSubContent } from '@/components/ui/menu';
import { ConfirmDialog, Dialog } from '@/components/ui/dialog';
import { Field, Input } from '@/components/ui/field';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/api';

/** Accessible per-document action menu shared by the library, collections and detail page. */
export function DocumentActions({ document: doc, collections = [], inCollectionId, onDeleted, trigger }) {
  const router = useRouter();
  const toast = useToast();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [title, setTitle] = useState(doc.title);
  const [busy, setBusy] = useState(false);
  const memberOf = new Set((doc.collections || []).map((c) => c.id));

  async function run(fn, success) {
    setBusy(true);
    try {
      await fn();
      if (success) toast.success(success);
      router.refresh();
      return true;
    } catch (err) {
      toast.error(err.message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function startChat() {
    await run(async () => {
      const { conversation } = await api('/api/conversations', {
        method: 'POST',
        body: { scope: { type: 'DOCUMENTS', documentIds: [doc.id] } },
      });
      router.push(`/app/chat/${conversation.id}`);
    });
  }

  return (
    <>
      <MenuRoot>
        <MenuTrigger asChild>
          {trigger || (
            <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${doc.title}`} onClick={(e) => e.stopPropagation()}>
              <MoreHorizontal />
            </Button>
          )}
        </MenuTrigger>
        <MenuContent onClick={(e) => e.stopPropagation()}>
          <MenuItem icon={ExternalLink} onSelect={() => router.push(`/app/documents/${doc.id}`)}>Open</MenuItem>
          <MenuItem icon={MessageSquarePlus} disabled={doc.status !== 'READY'} onSelect={startChat}>Ask about this document</MenuItem>
          <MenuItem icon={Pencil} onSelect={() => { setTitle(doc.title); setRenaming(true); }}>Rename</MenuItem>
          {collections.length > 0 && (
            <MenuSub>
              <MenuSubTrigger icon={FolderPlus}>Add to collection</MenuSubTrigger>
              <MenuSubContent>
                {collections.map((c) => (
                  <MenuItem
                    key={c.id}
                    disabled={memberOf.has(c.id)}
                    onSelect={() =>
                      run(() => api(`/api/collections/${c.id}/documents`, { method: 'POST', body: { documentIds: [doc.id] } }), `Added to ${c.name}`)
                    }
                  >
                    <span className="flex-1 truncate">{c.name}</span>
                    {memberOf.has(c.id) && <Check className="size-3.5" aria-label="Already added" />}
                  </MenuItem>
                ))}
              </MenuSubContent>
            </MenuSub>
          )}
          {inCollectionId && (
            <MenuItem
              icon={FolderMinus}
              onSelect={() =>
                run(() => api(`/api/collections/${inCollectionId}/documents`, { method: 'DELETE', body: { documentIds: [doc.id] } }), 'Removed from collection')
              }
            >
              Remove from collection
            </MenuItem>
          )}
          <MenuItem icon={Download} onSelect={() => window.location.assign(`/api/documents/${doc.id}/file?download=1`)}>Download original</MenuItem>
          {doc.status === 'FAILED' && (
            <MenuItem icon={RotateCw} onSelect={() => run(() => api(`/api/documents/${doc.id}/retry`, { method: 'POST' }), 'Processing restarted')}>
              Retry processing
            </MenuItem>
          )}
          <MenuSeparator />
          <MenuItem icon={Trash2} danger onSelect={() => setConfirmDelete(true)}>Delete</MenuItem>
        </MenuContent>
      </MenuRoot>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete this document?"
        description={`“${doc.title}” and its extracted text and search index will be permanently deleted. Existing answers keep their quoted excerpts, but their links to this document will stop working.`}
        confirmLabel="Delete document"
        loading={busy}
        onConfirm={async () => {
          const ok = await run(() => api(`/api/documents/${doc.id}`, { method: 'DELETE' }), 'Document deleted');
          if (ok) {
            setConfirmDelete(false);
            onDeleted?.();
          }
        }}
      />

      <Dialog open={renaming} onOpenChange={setRenaming} title="Rename document" size="sm">
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const ok = await run(() => api(`/api/documents/${doc.id}`, { method: 'PATCH', body: { title } }), 'Renamed');
            if (ok) setRenaming(false);
          }}
          className="space-y-4"
        >
          <Field label="Title">{(p) => <Input {...p} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} autoFocus />}</Field>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setRenaming(false)}>Cancel</Button>
            <Button type="submit" loading={busy} disabled={!title.trim()}>Save</Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
