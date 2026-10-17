'use client';
import { TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function AppError({ reset }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4 py-20 text-center">
      <TriangleAlert className="size-6 text-warn" aria-hidden />
      <h1 className="mt-3 text-lg font-semibold text-ink">This page couldn't load</h1>
      <p className="mt-1 max-w-sm text-sm text-ink-2">
        Docsy couldn't reach one of its services. Your documents are safe. Try again in a moment.
      </p>
      <div className="mt-5 flex gap-2">
        <Button onClick={reset}>Try again</Button>
        <Button href="/app" variant="secondary">Go to overview</Button>
      </div>
    </div>
  );
}
