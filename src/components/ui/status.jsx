import { CheckCircle2, CircleDashed, Loader2, TriangleAlert, Clock3 } from 'lucide-react';
import { cn } from '@/lib/cn';

const STATUS = {
  UPLOADING: { label: 'Uploading', icon: Loader2, spin: true, cls: 'text-ink-2 bg-surface-2' },
  QUEUED: { label: 'Queued', icon: Clock3, cls: 'text-ink-2 bg-surface-2' },
  PROCESSING: { label: 'Processing', icon: Loader2, spin: true, cls: 'text-ink bg-info-soft' },
  READY: { label: 'Ready', icon: CheckCircle2, cls: 'text-success bg-success-soft' },
  FAILED: { label: 'Failed', icon: TriangleAlert, cls: 'text-danger bg-danger-soft' },
};

export function StatusPill({ status, className }) {
  const s = STATUS[status] || { label: status, icon: CircleDashed, cls: 'text-ink-2 bg-surface-2' };
  const Icon = s.icon;
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium', s.cls, className)}>
      <Icon className={cn('size-3', s.spin && 'animate-spin')} aria-hidden />
      {s.label}
    </span>
  );
}

export function FileTypeBadge({ type, className }) {
  const label = { PDF: 'PDF', DOCX: 'DOCX', TXT: 'TXT' }[type] || type;
  return (
    <span className={cn('inline-flex h-5 items-center rounded-sm border border-line px-1.5 text-[10px] font-semibold tracking-wide text-ink-2', className)}>
      {label}
    </span>
  );
}
