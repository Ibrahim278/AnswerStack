import { Paper, Group, Text, Button, Progress, Stack, ThemeIcon, Badge, Box } from '@mantine/core';
import {
  IconBuildingBridge,
  IconRefresh,
  IconPlayerStop,
  IconRotateClockwise,
  IconChecks,
  IconAlertTriangle,
  IconClockHour4,
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
      <Paper withBorder p="lg" radius="xl" className="surface-card index-status-card">
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
      <Paper withBorder p="lg" radius="xl" className="surface-card index-status-card">
        <Stack gap="md">
          <Group justify="space-between" align="flex-start" wrap="wrap" gap="sm">
            <Group gap="sm" wrap="nowrap" align="flex-start">
              <ThemeIcon size="xl" radius="xl" variant="light" color="blue">
                <IconClockHour4 size={18} />
              </ThemeIcon>
              <Stack gap={2}>
                <Text className="page-intro__eyebrow" mb={0}>
                  Index Build
                </Text>
                <Text size="sm" fw={700}>
                  Indexing in progress
                </Text>
                <Text size="sm" c="dimmed">
                  {job.documents_processed}/{job.documents_total} documents processed ({percentage}%)
                </Text>
              </Stack>
            </Group>
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
          <Progress value={percentage} size="lg" radius="xl" animated />
        </Stack>
      </Paper>
    );
  }

  // Failed state
  if (indexStatus === 'failed' || (job && job.status === 'failed')) {
    return (
      <Paper withBorder p="lg" radius="xl" className="surface-card index-status-card">
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
      <Paper withBorder p="lg" radius="xl" className="surface-card index-status-card">
        <Group justify="space-between" align="flex-start" wrap="wrap" gap="sm">
          <Stack gap={2}>
            <Text className="page-intro__eyebrow" mb={0}>
              Index Build
            </Text>
            <Text size="sm" fw={700}>
              Indexing was cancelled
            </Text>
            <Text size="sm" c="dimmed">
              Restart the build when you are ready to refresh the workspace.
            </Text>
          </Stack>
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
      <Paper withBorder p="lg" radius="xl" className="surface-card index-status-card index-status-card--warning">
        <Group justify="space-between" align="flex-start" wrap="wrap" gap="sm">
          <Group gap="sm" wrap="nowrap" align="flex-start">
            <ThemeIcon size="xl" radius="xl" variant="light" color="orange">
              <IconAlertTriangle size={18} />
            </ThemeIcon>
            <Stack gap={2}>
              <Text className="page-intro__eyebrow" mb={0}>
                Index Health
              </Text>
              <Text size="sm" fw={700} c="orange.8">
                Index is out of date
              </Text>
              <Text size="sm" c="dimmed">
                At least one document changed after the most recent build.
              </Text>
            </Stack>
          </Group>
          <Box>
            {lastIndexed && (
              <Badge variant="light" color="orange" radius="xl" mb="xs">
                Last indexed {formatRelativeTime(lastIndexed)}
              </Badge>
            )}
            <div>
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
            </div>
          </Box>
        </Group>
      </Paper>
    );
  }

  if (indexStatus === 'indexed') {
    return (
      <Paper withBorder p="lg" radius="xl" className="surface-card index-status-card index-status-card--ready">
        <Group justify="space-between" align="flex-start" wrap="wrap" gap="sm">
          <Group gap="sm" wrap="nowrap" align="flex-start">
            <ThemeIcon size="xl" radius="xl" variant="light" color="ocean">
              <IconChecks size={18} />
            </ThemeIcon>
            <Stack gap={2}>
              <Text className="page-intro__eyebrow" mb={0}>
                Index Health
              </Text>
              <Text size="sm" fw={700} c="ocean.8">
                Index up to date
              </Text>
              <Text size="sm" c="dimmed">
                The workspace is ready for grounded answers against the current document set.
              </Text>
            </Stack>
          </Group>
          <Box>
            {lastIndexed && (
              <Badge variant="light" color="green" radius="xl" mb="xs">
                Last indexed {formatRelativeTime(lastIndexed)}
              </Badge>
            )}
            <div>
              <Button
                variant="light"
                size="xs"
                leftSection={<IconRefresh size={14} />}
                onClick={() => buildIndex.mutate(projectId)}
                loading={buildIndex.isPending}
              >
                Rebuild Index
              </Button>
            </div>
          </Box>
        </Group>
      </Paper>
    );
  }

  return (
    <Paper withBorder p="lg" radius="xl" className="surface-card index-status-card">
      <Group justify="space-between" align="flex-start" wrap="wrap" gap="sm">
        <Group gap="sm" wrap="nowrap" align="flex-start">
          <ThemeIcon size="xl" radius="xl" variant="light" color="sand">
            <IconBuildingBridge size={18} />
          </ThemeIcon>
          <Stack gap={2}>
            <Text className="page-intro__eyebrow" mb={0}>
              Index Health
            </Text>
            <Text size="sm" fw={700}>
              No index built yet
            </Text>
            <Text size="sm" c="dimmed">
              Build the first index once your source files are in place.
            </Text>
          </Stack>
        </Group>
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
