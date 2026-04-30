import {
  RefreshCw,
  Square,
  RotateCcw,
  CheckCheck,
  AlertTriangle,
  Clock,
  Construction,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import {
  useIndexingStatus,
  useBuildIndex,
  useCancelIndex,
  useRetryIndex,
} from '@/hooks/useIndexing';

interface IndexSectionProps {
  projectId: string;
}

function formatRelativeTime(dateString: string | null): string {
  if (!dateString) return '';
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSeconds < 60) return 'just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 30) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

function getErrorMessage(errorDetail: Record<string, unknown> | null): string {
  if (!errorDetail) return 'An unknown error occurred during indexing';
  if (typeof errorDetail.message === 'string') return errorDetail.message;
  if (typeof errorDetail.error === 'string') return errorDetail.error;
  return JSON.stringify(errorDetail);
}

export function IndexSection({ projectId }: IndexSectionProps) {
  const { data: status, isLoading } = useIndexingStatus(projectId);
  const buildIndex = useBuildIndex();
  const cancelIndex = useCancelIndex();
  const retryIndex = useRetryIndex();

  if (isLoading || !status) {
    return (
      <div className="border border-border rounded-lg bg-card p-5">
        <p className="text-sm text-muted-foreground">Loading index status...</p>
        {/* Invisible progress bar to reserve space */}
        <div className="mt-4"><Progress value={0} className="h-2 invisible" /></div>
      </div>
    );
  }

  const indexStatus = status.index_status;
  const job = status.job;
  const lastIndexed = status.last_indexed_at;
  const hasActiveJob = !!job && (job.status === 'running' || job.status === 'pending');
  const isBuilding = indexStatus === 'indexing' || hasActiveJob;
  const isFailed = indexStatus === 'failed' || (job && job.status === 'failed');

  // Determine card style
  let borderClass = 'border-border bg-card';
  if (isBuilding) borderClass = 'border-border bg-card';
  else if (isFailed) borderClass = 'border-destructive/30 bg-destructive/5';
  else if (indexStatus === 'stale') borderClass = 'border-orange-500/30 bg-orange-500/5';
  else if (indexStatus === 'indexed') borderClass = 'border-emerald-500/30 bg-emerald-500/5';

  // Determine icon
  let icon: React.ReactNode;
  let iconBg: string;
  if (isBuilding) {
    icon = <Clock className="w-5 h-5 text-primary" />;
    iconBg = 'bg-primary/10';
  } else if (isFailed) {
    icon = <AlertTriangle className="w-5 h-5 text-destructive" />;
    iconBg = 'bg-destructive/10';
  } else if (indexStatus === 'stale') {
    icon = <AlertTriangle className="w-5 h-5 text-orange-600 dark:text-orange-400" />;
    iconBg = 'bg-orange-500/10';
  } else if (indexStatus === 'indexed') {
    icon = <CheckCheck className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />;
    iconBg = 'bg-emerald-500/10';
  } else {
    icon = <Construction className="w-5 h-5 text-muted-foreground" />;
    iconBg = 'bg-muted';
  }

  // Determine text
  let label: string;
  let title: string;
  let titleColor = 'text-foreground';
  let description: string;
  if (isBuilding) {
    label = 'Index Build';
    title = 'Indexing in progress';
    if (hasActiveJob) {
      const percentage = Math.round(job!.percentage);
      description = `${job!.documents_processed}/${job!.documents_total} documents processed (${percentage}%)`;
    } else {
      description = 'Preparing index build...';
    }
  } else if (isFailed) {
    label = 'Index Build';
    title = 'Indexing failed';
    titleColor = 'text-destructive';
    description = getErrorMessage(job?.error_detail ?? null);
  } else if (indexStatus === 'stale') {
    label = 'Index Health';
    title = 'Index is out of date';
    titleColor = 'text-orange-700 dark:text-orange-400';
    description = 'At least one document changed after the most recent build.';
  } else if (indexStatus === 'indexed') {
    label = 'Index Health';
    title = 'Index up to date';
    titleColor = 'text-emerald-700 dark:text-emerald-400';
    description = 'The workspace is ready for grounded answers against the current document set.';
  } else {
    label = 'Index Health';
    title = 'No index built yet';
    description = 'Build the first index once your source files are in place.';
  }

  // Action area — always same structure: badge slot + button, fixed width
  const isStale = indexStatus === 'stale';
  const showBadge = !isBuilding && !isFailed && lastIndexed;
  const badgeClass = isStale
    ? 'border-orange-500/30 text-orange-700 dark:text-orange-400'
    : indexStatus === 'indexed'
      ? 'border-emerald-500/30 text-emerald-700 dark:text-emerald-400'
      : '';

  let buttonContent: React.ReactNode;
  let buttonProps: Record<string, unknown>;
  if (isBuilding && hasActiveJob) {
    buttonContent = <><Square className="w-3.5 h-3.5 mr-1.5" />Cancel</>;
    buttonProps = { variant: 'outline', onClick: () => cancelIndex.mutate(projectId), disabled: cancelIndex.isPending };
  } else if (isBuilding) {
    buttonContent = <><Clock className="w-3.5 h-3.5 mr-1.5 animate-spin" />Starting...</>;
    buttonProps = { variant: 'outline', disabled: true };
  } else if (isFailed) {
    buttonContent = <><RotateCcw className="w-3.5 h-3.5 mr-1.5" />{retryIndex.isPending ? 'Retrying...' : 'Retry'}</>;
    buttonProps = { variant: 'outline', onClick: () => retryIndex.mutate(projectId), disabled: retryIndex.isPending };
  } else {
    buttonContent = indexStatus === 'not_indexed'
      ? <><Construction className="w-3.5 h-3.5 mr-1.5" />Build Index</>
      : <><RefreshCw className="w-3.5 h-3.5 mr-1.5" />Rebuild Index</>;
    buttonProps = {
      variant: indexStatus === 'not_indexed' ? 'default' : 'outline',
      className: isStale ? 'border-orange-500/30 text-orange-700 hover:bg-orange-500/10 dark:text-orange-400' : '',
      onClick: () => buildIndex.mutate(projectId),
      disabled: buildIndex.isPending,
    };
  }

  const actionButton = (
    <div className="flex flex-col items-end gap-1.5 sm:min-w-[140px]">
      {/* Badge slot — always present, invisible when not needed */}
      <Badge variant="outline" className={`${showBadge ? badgeClass : 'invisible'}`}>
        {showBadge ? `Last indexed ${formatRelativeTime(lastIndexed)}` : '\u00A0'}
      </Badge>
      <Button size="sm" className="w-full" {...buttonProps}>
        {buttonContent}
      </Button>
    </div>
  );

  return (
    <div className={`border rounded-lg p-5 ${borderClass}`}>
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${iconBg}`}>
              {icon}
            </div>
            <div className="space-y-0.5">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {label}
              </p>
              <p className={`text-sm font-semibold ${titleColor}`}>
                {title}
              </p>
              <p className="text-sm text-muted-foreground">
                {description}
              </p>
            </div>
          </div>
          {actionButton}
        </div>
        {/* Progress bar always in DOM to prevent CLS — invisible when not building */}
        <Progress
          value={hasActiveJob ? Math.round(job!.percentage) : 0}
          className={`h-2 ${isBuilding ? '' : 'invisible'}`}
        />
      </div>
    </div>
  );
}
