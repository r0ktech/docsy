import { cn } from '@/lib/cn';

export function PageHeader({ title, description, actions, className, children }) {
  return (
    <div className={cn('border-b border-line bg-surface px-4 py-5 sm:px-6 lg:px-8', className)}>
      <div className="mx-auto flex max-w-6xl flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold tracking-[-0.01em] text-ink">{title}</h1>
          {description && <p className="mt-1 text-sm text-ink-2">{description}</p>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children && <div className="mx-auto mt-4 max-w-6xl">{children}</div>}
    </div>
  );
}

export function PageBody({ className, children }) {
  return <div className={cn('mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8', className)}>{children}</div>;
}
