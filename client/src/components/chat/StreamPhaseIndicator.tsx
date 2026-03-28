import type { StreamPhase } from '@/types';

interface StreamPhaseIndicatorProps {
  phase: StreamPhase;
}

const PHASE_LABELS: Record<string, string> = {
  searching: 'Searching sources',
  generating: 'Generating answer',
};

/**
 * Animated dots + stage label shown before tokens arrive during streaming.
 * "Searching sources..." / "Generating answer..."
 */
export function StreamPhaseIndicator({ phase }: StreamPhaseIndicatorProps) {
  const label = PHASE_LABELS[phase];
  if (!label) return null;

  return (
    <div className="flex justify-start">
      <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-card border border-border">
        <div className="flex gap-1 items-center">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="w-1.5 h-1.5 rounded-full bg-primary animate-dot-pulse"
              style={{ animationDelay: `${i * 0.2}s` }}
            />
          ))}
        </div>
        <span className="text-sm text-muted-foreground">{label}...</span>
      </div>
    </div>
  );
}
