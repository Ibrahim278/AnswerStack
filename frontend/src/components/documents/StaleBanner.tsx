import { Alert, Button, Group, Stack, Text } from '@mantine/core';
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
      radius="xl"
      variant="light"
      className="project-stale-banner"
    >
      <Group justify="space-between" align="flex-start" wrap="wrap" gap="sm">
        <Stack gap={4} style={{ flex: 1, minWidth: 240 }}>
          <Text size="sm">
            {staleCount} document{staleCount !== 1 ? 's' : ''} changed since the last successful build.
          </Text>
          <Text size="sm" c="dimmed">
            Rebuild now so chat answers reflect the newest file set.
          </Text>
        </Stack>
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
