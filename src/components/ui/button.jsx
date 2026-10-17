import Link from 'next/link';
import { forwardRef } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/cn';

const base =
  'inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium transition-colors select-none disabled:opacity-50 disabled:pointer-events-none [&_svg]:shrink-0';

const variants = {
  primary: 'bg-ink text-bg hover:bg-ink/85 shadow-sm',
  secondary: 'bg-surface text-ink border border-line-strong hover:bg-surface-2 shadow-sm',
  ghost: 'text-ink-2 hover:text-ink hover:bg-surface-2',
  danger: 'bg-danger text-white hover:bg-danger/90 dark:text-bg shadow-sm',
  mark: 'bg-mark text-mark-ink hover:brightness-95 shadow-sm',
  link: 'text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink px-0 h-auto',
};

const sizes = {
  xs: 'h-7 px-2 text-xs rounded-sm [&_svg]:size-3.5',
  sm: 'h-8 px-3 text-sm rounded-md [&_svg]:size-4',
  md: 'h-10 px-4 text-sm rounded-md [&_svg]:size-4',
  lg: 'h-12 px-5 text-base rounded-lg [&_svg]:size-5',
  icon: 'size-9 rounded-md [&_svg]:size-[18px]',
  'icon-sm': 'size-8 rounded-md [&_svg]:size-4',
};

export function buttonClass({ variant = 'primary', size = 'md', className } = {}) {
  return cn(base, variants[variant], sizes[size], className);
}

export const Button = forwardRef(function Button(
  { variant = 'primary', size = 'md', loading = false, href, className, children, disabled, type = 'button', ...props },
  ref,
) {
  const cls = buttonClass({ variant, size, className });
  if (href) {
    return (
      <Link ref={ref} href={href} className={cls} {...props}>
        {children}
      </Link>
    );
  }
  return (
    <button ref={ref} type={type} className={cls} disabled={disabled || loading} aria-busy={loading || undefined} {...props}>
      {loading && <Loader2 className="animate-spin" aria-hidden />}
      {children}
    </button>
  );
});
