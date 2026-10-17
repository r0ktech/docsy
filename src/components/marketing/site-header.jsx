import Link from 'next/link';
import { Wordmark } from '@/components/brand/logo';
import { Button } from '@/components/ui/button';

const NAV = [
  { href: '/#how', label: 'How it works' },
  { href: '/#privacy', label: 'Privacy' },
  { href: '/#pricing', label: 'Pricing' },
  { href: '/#faq', label: 'FAQ' },
];

export function SiteHeader({ signedIn }) {
  return (
    <header className="sticky top-0 z-40 border-b border-line/70 bg-bg/85 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-6 px-4 sm:px-6">
        <Link href="/" aria-label="Docsy home" className="rounded-md">
          <Wordmark />
        </Link>
        <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="rounded-md px-3 py-2 text-sm text-ink-2 hover:text-ink">
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          {signedIn ? (
            <Button href="/app" size="sm">Open Docsy</Button>
          ) : (
            <>
              <Button href="/sign-in" variant="ghost" size="sm">Sign in</Button>
              <Button href="/sign-up" size="sm">Get started</Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
