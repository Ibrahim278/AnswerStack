import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface RelevanceBadgeProps {
  score: number;
}

function getRelevanceStyle(score: number): string {
  const pct = score * 100;
  if (pct >= 80) return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30';
  if (pct >= 50) return 'bg-amber-500/15 text-amber-400 border-amber-500/30';
  return 'bg-orange-500/15 text-orange-400 border-orange-500/30';
}

/**
 * Color-coded relevance percentage badge for source cards.
 * High (>=80%) = green, Medium (>=50%) = amber, Low (<50%) = orange.
 */
export function RelevanceBadge({ score }: RelevanceBadgeProps) {
  const pct = Math.round(score * 100);
  return (
    <Badge
      variant="outline"
      className={cn('text-[10px] font-bold px-1.5 py-0', getRelevanceStyle(score))}
    >
      {pct}%
    </Badge>
  );
}
