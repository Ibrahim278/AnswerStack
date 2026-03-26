import { Text, Group, Box } from '@mantine/core';
import type { StreamPhase } from '../../types';

interface StreamPhaseIndicatorProps {
  phase: StreamPhase;
}

const PHASE_LABELS: Record<string, string> = {
  searching: 'Searching sources',
  generating: 'Generating answer',
};

/**
 * Animated dots + stage label: "Searching sources..." / "Generating answer..." (D-17).
 */
export function StreamPhaseIndicator({ phase }: StreamPhaseIndicatorProps) {
  const label = PHASE_LABELS[phase];
  if (!label) return null;

  return (
    <Group gap="xs" py="xs">
      <Box
        style={{
          display: 'flex',
          gap: '4px',
          alignItems: 'center',
        }}
      >
        {[0, 1, 2].map((i) => (
          <Box
            key={i}
            component="span"
            style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              backgroundColor: 'var(--mantine-color-blue-6)',
              animation: `dotPulse 1.5s ease-in-out ${i * 0.2}s infinite`,
            }}
          />
        ))}
      </Box>
      <Text size="sm" c="dimmed">
        {label}...
      </Text>
      {/* CSS keyframes injected via style tag */}
      <style>{`
        @keyframes dotPulse {
          0%, 80%, 100% { opacity: 0.3; }
          40% { opacity: 1; }
        }
        @media (prefers-reduced-motion: reduce) {
          @keyframes dotPulse {
            0%, 100% { opacity: 1; }
          }
        }
      `}</style>
    </Group>
  );
}
