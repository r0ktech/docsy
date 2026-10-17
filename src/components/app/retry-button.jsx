'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { RotateCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/api';

export function RetryButton({ documentId, size = 'xs', variant = 'secondary' }) {
  const router = useRouter();
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  return (
    <Button
      size={size}
      variant={variant}
      loading={loading}
      onClick={async () => {
        setLoading(true);
        try {
          await api(`/api/documents/${documentId}/retry`, { method: 'POST' });
          toast.info('Processing restarted');
          router.refresh();
        } catch (err) {
          toast.error(err.message);
        } finally {
          setLoading(false);
        }
      }}
    >
      {!loading && <RotateCw />}
      Retry
    </Button>
  );
}
