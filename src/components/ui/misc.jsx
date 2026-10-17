import { cn } from '@/lib/cn';

export function Spinner({ className, label = 'Loading' }) {
  return (
    <span role="status" className={cn('inline-block size-4 animate-spin rounded-full border-2 border-line-strong border-t-ink', className)}>
      <span className="sr-only">{label}</span>
    </span>
  );
}

export function Skeleton({ className }) {
  return <div className={cn('animate-pulse rounded-md bg-surface-2', className)} aria-hidden />;
}

export function EmptyState({ icon: Icon, title, children, action, className }) {
  return (
    <div className={cn('flex flex-col items-center justify-center rounded-lg border border-dashed border-line-strong px-6 py-12 text-center', className)}>
      {Icon && (
        <div className="mb-4 grid size-11 place-items-center rounded-full bg-surface-2 text-ink-2">
          <Icon className="size-5" aria-hidden />
        </div>
      )}
      <h3 className="text-base font-semibold text-ink">{title}</h3>
      {children && <div className="mt-1.5 max-w-sm text-sm text-ink-2">{children}</div>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Meter({ value, max, label, detail }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  const tone = pct >= 100 ? 'bg-danger' : pct >= 80 ? 'bg-warn' : 'bg-ink';
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="text-ink-2">{label}</span>
        <span className="tabular-nums text-ink">{detail}</span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-3" role="progressbar" aria-label={label} aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
        <div className={cn('h-full rounded-full transition-[width]', tone)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function Card({ className, children, ...props }) {
  return (
    <div className={cn('rounded-lg border border-line bg-surface', className)} {...props}>
      {children}
    </div>
  );
}

export function SectionHeader({ title, action, className }) {
  return (
    <div className={cn('mb-3 flex items-center justify-between gap-3', className)}>
      <h2 className="text-sm font-semibold text-ink">{title}</h2>
      {action}
    </div>
  );
}
