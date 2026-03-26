import { Paper, Group, Text, Button, Progress, Stack } from '@mantine/core';
import {
  IconBuildingBridge,
  IconRefresh,
  IconPlayerStop,
  IconRotateClockwise,
} from '@tabler/icons-react';
import {
  useIndexingStatus,
  useBuildIndex,
  useCancelIndex,
  useRetryIndex,
} from '../../hooks/useIndexing';
import { ErrorBanner } from '../common/ErrorBanner';

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
      <Paper withBorder p="md" radius="md">
        <Text size="sm" c="dimmed">Loading index status...</Text>
      </Paper>
    );
  }

  const indexStatus = status.index_status;
  const job = status.job;
  const lastIndexed = status.last_indexed_at;

  // Active indexing state with progress bar
  if (job && (job.status === 'running' || job.status === 'pending')) {
    const percentage = Math.round(job.percentage);
    return (
      <Paper withBorder p="md" radius="md">
        <Stack gap="sm">
          <Group justify="space-between" align="center">
            <div>
              <Text size="sm" fw={700}>
                Indexing in progress
              </Text>
              <Text size="xs" c="dimmed">
                {job.documents_processed}/{job.documents_total} documents ({percentage}%)
              </Text>
            </div>
            <Button
              variant="light"
              color="gray"
              size="xs"
              leftSection={<IconPlayerStop size={14} />}
              onClick={() => cancelIndex.mutate(projectId)}
              loading={cancelIndex.isPending}
            >
              Cancel
            </Button>
          </Group>
          <Progress value={percentage} size="md" animated />
        </Stack>
      </Paper>
    );
  }

  // Failed state
  if (indexStatus === 'failed' || (job && job.status === 'failed')) {
    return (
      <Paper withBorder p="md" radius="md">
        <Stack gap="sm">
          <ErrorBanner
            title="Indexing failed"
            message={getErrorMessage(job?.error_detail ?? null)}
            actions={[
              {
                label: 'Retry',
                onClick: () => retryIndex.mutate(projectId),
                loading: retryIndex.isPending,
              },
            ]}
          />
        </Stack>
      </Paper>
    );
  }

  // Cancelled state
  if (job && job.status === 'cancelled') {
    return (
      <Paper withBorder p="md" radius="md">
        <Group justify="space-between" align="center">
          <Text size="sm" c="dimmed">
            Indexing was cancelled
          </Text>
          <Button
            variant="light"
            size="xs"
            leftSection={<IconRefresh size={14} />}
            onClick={() => buildIndex.mutate(projectId)}
            loading={buildIndex.isPending}
          >
            Rebuild
          </Button>
        </Group>
      </Paper>
    );
  }

  // Stale state
  if (indexStatus === 'stale') {
    return (
      <Paper withBorder p="md" radius="md">
        <Group justify="space-between" align="center">
          <div>
            <Text size="sm" fw={700} c="orange">
              Index is out of date
            </Text>
            {lastIndexed && (
              <Text size="xs" c="dimmed">
                Last indexed {formatRelativeTime(lastIndexed)}
              </Text>
            )}
          </div>
          <Button
            variant="light"
            color="orange"
            size="xs"
            leftSection={<IconRotateClockwise size={14} />}
            onClick={() => buildIndex.mutate(projectId)}
            loading={buildIndex.isPending}
          >
            Rebuild Index
          </Button>
        </Group>
      </Paper>
    );
  }

  // Indexed (up to date) state
  if (indexStatus === 'indexed') {
    return (
      <Paper withBorder p="md" radius="md">
        <Group justify="space-between" align="center">
          <div>
            <Text size="sm" fw={700} c="green">
              Index up to date
            </Text>
            {lastIndexed && (
              <Text size="xs" c="dimmed">
                Last indexed {formatRelativeTime(lastIndexed)}
              </Text>
            )}
          </div>
          <Button
            variant="light"
            size="xs"
            leftSection={<IconRefresh size={14} />}
            onClick={() => buildIndex.mutate(projectId)}
            loading={buildIndex.isPending}
          >
            Rebuild Index
          </Button>
        </Group>
      </Paper>
    );
  }

  // Not indexed (default) state
  return (
    <Paper withBorder p="md" radius="md">
      <Group justify="space-between" align="center">
        <Text size="sm" c="dimmed">
          No index built
        </Text>
        <Button
          size="xs"
          leftSection={<IconBuildingBridge size={14} />}
          onClick={() => buildIndex.mutate(projectId)}
          loading={buildIndex.isPending}
        >
          Build Index
        </Button>
      </Group>
    </Paper>
  );
}
