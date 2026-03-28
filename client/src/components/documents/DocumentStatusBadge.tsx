import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface DocumentStatusBadgeProps {
  status: string;
  errorDetail?: Record<string, unknown> | null;
}

interface StatusConfig {
  label: string;
  className: string;
  pulse?: boolean;
}

function getStatusConfig(status: string): StatusConfig {
  switch (status) {
    case 'uploaded':
      return {
        label: 'Uploaded',
        className:
          'bg-yellow-500/10 text-yellow-700 border-yellow-500/20 dark:text-yellow-400',
      };
    case 'parsing':
      return {
        label: 'Parsing',
        className:
          'bg-blue-500/10 text-blue-700 border-blue-500/20 dark:text-blue-400',
        pulse: true,
      };
    case 'parsed':
      return {
        label: 'Parsed',
        className:
          'bg-teal-500/10 text-teal-700 border-teal-500/20 dark:text-teal-400',
      };
    case 'indexing':
      return {
        label: 'Indexing',
        className:
          'bg-blue-500/10 text-blue-700 border-blue-500/20 dark:text-blue-400',
        pulse: true,
      };
    case 'indexed':
      return {
        label: 'Indexed',
        className:
          'bg-emerald-500/10 text-emerald-700 border-emerald-500/20 dark:text-emerald-400',
      };
    case 'failed':
      return {
        label: 'Failed',
        className: 'bg-destructive/10 text-destructive border-destructive/20',
      };
    case 'stale':
      return {
        label: 'Stale',
        className:
          'bg-orange-500/10 text-orange-700 border-orange-500/20 dark:text-orange-400',
      };
    case 'reindex_required':
      return {
        label: 'Needs reindex',
        className:
          'bg-orange-500/10 text-orange-700 border-orange-500/20 dark:text-orange-400',
      };
    default:
      return {
        label: status,
        className: 'bg-muted text-muted-foreground border-border',
      };
  }
}

function getErrorMessage(
  errorDetail: Record<string, unknown> | null | undefined,
): string {
  if (!errorDetail) return 'An unknown error occurred';
  if (typeof errorDetail.message === 'string') return errorDetail.message;
  if (typeof errorDetail.error === 'string') return errorDetail.error;
  return JSON.stringify(errorDetail);
}

export function DocumentStatusBadge({
  status,
  errorDetail,
}: DocumentStatusBadgeProps) {
  const config = getStatusConfig(status);

  const badge = (
    <Badge
      variant="outline"
      className={cn(
        'text-[11px] font-medium',
        config.className,
        config.pulse && 'animate-pulse',
      )}
    >
      {config.label}
    </Badge>
  );

  if (status === 'failed' && errorDetail) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>{badge}</TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs">
            <p className="text-xs">{getErrorMessage(errorDetail)}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return badge;
}
