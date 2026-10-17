import Link from 'next/link';
import { Wordmark } from '@/components/brand/logo';

export function SiteFooter() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="space-y-2">
          <Wordmark markClassName="size-6" />
          <p className="text-sm text-ink-3">Answers from your documents, with the receipts.</p>
        </div>
        <nav aria-label="Footer" className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-ink-2">
          <Link href="/privacy" className="hover:text-ink">Privacy policy</Link>
          <Link href="/terms" className="hover:text-ink">Terms</Link>
          <Link href="/contact" className="hover:text-ink">Contact</Link>
          <Link href="/sign-in" className="hover:text-ink">Sign in</Link>
        </nav>
      </div>
    </footer>
  );
}
