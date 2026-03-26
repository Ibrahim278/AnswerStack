import { Alert, Button, Group } from '@mantine/core';
import { IconAlertTriangle } from '@tabler/icons-react';
import { useBuildIndex } from '../../hooks/useIndexing';

interface StaleBannerProps {
  staleCount: number;
  projectId: string;
}

export function StaleBanner({ staleCount, projectId }: StaleBannerProps) {
  const buildIndex = useBuildIndex();

  if (staleCount <= 0) return null;

  return (
    <Alert
      color="orange"
      icon={<IconAlertTriangle size={20} />}
      title="Index is out of date"
    >
      <Group justify="space-between" align="center">
        Index is out of date — {staleCount} document{staleCount !== 1 ? 's' : ''} changed since last build. Rebuild now?
        <Button
          variant="light"
          color="orange"
          size="xs"
          onClick={() => buildIndex.mutate(projectId)}
          loading={buildIndex.isPending}
        >
          Rebuild Index
        </Button>
      </Group>
    </Alert>
  );
}
