'use client';
import { Button } from '@/components/ui/button';

export default function GlobalError({ reset }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 text-center">
      <h1 className="font-serif text-3xl font-medium text-ink">Something went wrong</h1>
      <p className="mt-2 max-w-sm text-ink-2">An unexpected error stopped this page from loading. Try again, and if it keeps happening, come back in a few minutes.</p>
      <Button className="mt-6" onClick={reset}>Try again</Button>
    </main>
  );
}
