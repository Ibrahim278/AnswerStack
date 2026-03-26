import { Badge } from '@mantine/core';

interface RelevanceBadgeProps {
  score: number;
}

function getRelevanceColor(score: number): string {
  const pct = score * 100;
  if (pct >= 80) return 'green';
  if (pct >= 50) return 'yellow';
  return 'orange';
}

/**
 * Color-coded relevance percentage badge for source cards (D-19).
 */
export function RelevanceBadge({ score }: RelevanceBadgeProps) {
  const pct = Math.round(score * 100);
  return (
    <Badge color={getRelevanceColor(score)} variant="light" size="sm" fw={700}>
      {pct}%
    </Badge>
  );
}
