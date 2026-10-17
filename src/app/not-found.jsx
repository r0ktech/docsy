import Link from 'next/link';
import { Wordmark } from '@/components/brand/logo';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 text-center">
      <Link href="/" aria-label="Docsy home"><Wordmark /></Link>
      <h1 className="mt-10 font-serif text-4xl font-medium tracking-[-0.02em] text-ink">Page not found</h1>
      <p className="mt-2 max-w-sm text-ink-2">It may have been deleted, or the link may be wrong.</p>
      <Button href="/app" className="mt-6">Go to your library</Button>
    </main>
  );
}
