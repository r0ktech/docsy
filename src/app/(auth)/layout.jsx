import Link from 'next/link';
import { Wordmark } from '@/components/brand/logo';

export default function AuthLayout({ children }) {
  return (
    <div className="flex min-h-dvh flex-col px-4">
      <header className="mx-auto flex h-16 w-full max-w-6xl items-center">
        <Link href="/" aria-label="Docsy home" className="rounded-md">
          <Wordmark />
        </Link>
      </header>
      <main className="flex flex-1 items-start justify-center pb-16 pt-8 sm:items-center sm:pt-0">
        <div className="w-full max-w-sm">{children}</div>
      </main>
    </div>
  );
}
