import { cn } from '@/lib/cn';

/** The Docsy mark: a page with a folded corner and one highlighted line. */
export function LogoMark({ className }) {
  return (
    <svg viewBox="0 0 32 32" className={cn('size-7', className)} aria-hidden>
      <rect width="32" height="32" rx="7.5" className="fill-ink" />
      <path d="M10 7h8.5L23 11.5V24a1 1 0 0 1-1 1H10a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1Z" className="fill-bg" />
      <path d="M18.5 7v4.5H23" fill="none" className="stroke-line-strong" strokeWidth="1.2" />
      <rect x="11.5" y="15" width="9" height="3.2" rx="1" className="fill-mark" />
      <rect x="11.5" y="20" width="6" height="1.4" rx=".7" className="fill-line-strong" />
    </svg>
  );
}

export function Wordmark({ className, markClassName }) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <LogoMark className={markClassName} />
      <span className="font-serif text-[1.35rem] font-semibold leading-none tracking-[-0.02em] text-ink">docsy</span>
    </span>
  );
}
