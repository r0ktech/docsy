'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Field, Input, Textarea } from '@/components/ui/field';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/api';

/** Create (no `collection`) or rename/edit an existing collection. */
export function CollectionFormDialog({ open, onOpenChange, collection, onSaved }) {
  const router = useRouter();
  const toast = useToast();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      setName(collection?.name || '');
      setDescription(collection?.description || '');
      setError('');
    }
  }, [open, collection]);

  async function submit(e) {
    e.preventDefault();
    if (!name.trim()) return setError('Give the collection a name.');
    setLoading(true);
    try {
      const body = { name: name.trim(), description: description.trim() || null };
      const res = collection
        ? await api(`/api/collections/${collection.id}`, { method: 'PATCH', body })
        : await api('/api/collections', { method: 'POST', body });
      toast.success(collection ? 'Collection updated' : `Created “${res.collection.name}”`);
      onOpenChange(false);
      onSaved?.(res.collection);
      router.refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={collection ? 'Edit collection' : 'New collection'} description="Group related documents so you can ask questions across them.">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Name" error={error}>
          {(p) => <Input {...p} value={name} onChange={(e) => setName(e.target.value)} maxLength={60} autoFocus placeholder="e.g. Q3 board materials" />}
        </Field>
        <Field label="Description" hint="Optional">
          {(p) => <Textarea {...p} rows={2} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={280} />}
        </Field>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" loading={loading}>{collection ? 'Save changes' : 'Create collection'}</Button>
        </div>
      </form>
    </Dialog>
  );
}
