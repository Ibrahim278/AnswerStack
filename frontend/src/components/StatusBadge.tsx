import { cn } from '@/lib/utils';

const statusConfig: Record<string, { label: string; color: string; dot: string }> = {
  ready: { label: 'System Ready', color: 'text-success', dot: 'bg-success' },
  indexing: { label: 'Indexing...', color: 'text-warning', dot: 'bg-warning animate-pulse-subtle' },
  misconfigured: { label: 'Misconfigured', color: 'text-destructive', dot: 'bg-destructive' },
  degraded: { label: 'Degraded', color: 'text-warning', dot: 'bg-warning' },
  no_documents: { label: 'No Documents', color: 'text-muted-foreground', dot: 'bg-muted-foreground' },
  stale: { label: 'Stale Index', color: 'text-warning', dot: 'bg-warning' },
};

export function StatusBadge({ status }: { status: string }) {
  const config = statusConfig[status] || statusConfig.ready;
  return (
    <div className="flex items-center gap-2">
      <div className={cn('w-1.5 h-1.5 rounded-full', config.dot)} />
      <span className={cn('text-xs', config.color)}>{config.label}</span>
    </div>
  );
}
