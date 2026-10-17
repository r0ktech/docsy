'use client';
import { useState } from 'react';
import { Upload, FolderPlus, MessageSquarePlus } from 'lucide-react';
import Link from 'next/link';
import { useUpload } from '@/components/app/upload-provider';
import { CollectionFormDialog } from '@/components/app/collection-form-dialog';

export function QuickActions() {
  const { openUpload } = useUpload();
  const [creating, setCreating] = useState(false);
  const item = 'flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm text-ink hover:bg-surface-2';
  return (
    <div className="space-y-0.5">
      <button className={item} onClick={() => openUpload()}>
        <Upload className="size-4 text-ink-2" aria-hidden /> Upload documents
      </button>
      <button className={item} onClick={() => setCreating(true)}>
        <FolderPlus className="size-4 text-ink-2" aria-hidden /> New collection
      </button>
      <Link href="/app/chat" className={item}>
        <MessageSquarePlus className="size-4 text-ink-2" aria-hidden /> Start a conversation
      </Link>
      <CollectionFormDialog open={creating} onOpenChange={setCreating} />
    </div>
  );
}
