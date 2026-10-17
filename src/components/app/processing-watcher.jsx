'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * While documents are queued or processing, refreshes server data on an
 * interval so statuses update without a manual reload. Stops when idle or
 * when the tab is hidden.
 */
export function ProcessingWatcher({ active, intervalMs = 3000 }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') router.refresh();
    }, intervalMs);
    return () => clearInterval(id);
  }, [active, intervalMs, router]);
  return null;
}
