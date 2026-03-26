import { Badge, Popover, Stack, Group, Text, Button, Divider, Box } from '@mantine/core';
import {
  IconCircleFilled,
  IconSettings,
  IconRefresh,
  IconPlugConnected,
} from '@tabler/icons-react';
import { useNavigate, useParams } from 'react-router';
import { useState } from 'react';
import { useSystemStatus } from '../../hooks/useSystemStatus';
import { useBuildIndex } from '../../hooks/useIndexing';
import { useTestConnection } from '../../hooks/useProvider';

const STATUS_CONFIG: Record<string, { color: string; label: string }> = {
  ready: { color: 'green', label: 'Ready' },
  indexing: { color: 'blue', label: 'Indexing' },
  misconfigured: { color: 'red', label: 'Misconfigured' },
  degraded: { color: 'yellow', label: 'Degraded' },
  no_documents: { color: 'gray', label: 'No Documents' },
  stale: { color: 'orange', label: 'Stale' },
};

function getStatusConfig(status: string) {
  return STATUS_CONFIG[status] ?? { color: 'gray', label: status };
}

function SubsystemRow({ label, ok, detail }: { label: string; ok: boolean; detail?: string }) {
  return (
    <Group justify="space-between" gap="xs">
      <Group gap="xs" wrap="nowrap">
        <IconCircleFilled
          size={8}
          style={{ color: ok ? 'var(--mantine-color-green-6)' : 'var(--mantine-color-red-6)' }}
        />
        <Text size="sm">{label}</Text>
      </Group>
      <Text size="xs" c={ok ? 'dimmed' : 'red'}>
        {detail ?? (ok ? 'OK' : 'Issue')}
      </Text>
    </Group>
  );
}

export function StatusBadge() {
  const [opened, setOpened] = useState(false);
  const navigate = useNavigate();
  const params = useParams<{ id: string }>();
  const { data } = useSystemStatus(params.id);
  const buildIndex = useBuildIndex();
  const testConnection = useTestConnection();

  if (!data) {
    return (
      <Badge color="gray" variant="dot" size="sm">
        Loading
      </Badge>
    );
  }

  const { color, label } = getStatusConfig(data.status);
  const isIndexing = data.status === 'indexing';

  return (
    <Popover opened={opened} onChange={setOpened} position="bottom-end" withArrow shadow="md">
      <Popover.Target>
        <Badge
          color={color}
          variant="dot"
          size="sm"
          style={{
            cursor: 'pointer',
            ...(isIndexing
              ? { animation: 'pulse 2s ease-in-out infinite' }
              : {}),
          }}
          onClick={() => { setOpened((o) => !o); }}
        >
          {label}
        </Badge>
      </Popover.Target>

      <Popover.Dropdown miw={280}>
        <Stack gap="sm">
          <Text fw={700} size="sm">
            System Status
          </Text>
          <Divider />

          {/* Subsystem rows */}
          <SubsystemRow
            label="Provider"
            ok={data.provider.connected}
            detail={
              !data.provider.configured
                ? 'Not configured'
                : data.provider.connected
                  ? 'Connected'
                  : data.provider.last_error ?? 'Disconnected'
            }
          />
          <SubsystemRow label="Database" ok={data.health.database} />
          <SubsystemRow label="Vector Store" ok={data.health.vector_store} />

          {data.project && (
            <SubsystemRow
              label="Index"
              ok={data.project.index_status === 'indexed'}
              detail={
                data.project.active_job
                  ? `Building (${Math.round((data.project.active_job.progress_current / Math.max(data.project.active_job.progress_total, 1)) * 100)}%)`
                  : data.project.index_status === 'indexed'
                    ? 'Up to date'
                    : data.project.index_status === 'stale'
                      ? 'Stale'
                      : 'Not built'
              }
            />
          )}

          {/* Warnings */}
          {data.provider.last_error && (
            <Box>
              <Text size="xs" c="red">
                {data.provider.last_error}
              </Text>
            </Box>
          )}

          {data.project && data.project.documents_stale > 0 && (
            <Box>
              <Text size="xs" c="orange">
                {data.project.documents_stale} document(s) stale since last index build
              </Text>
            </Box>
          )}

          <Divider />

          {/* Contextual action buttons */}
          {data.status === 'misconfigured' && (
            <Button
              size="xs"
              variant="light"
              leftSection={<IconSettings size={14} />}
              onClick={() => {
                void navigate('/settings');
                setOpened(false);
              }}
            >
              Go to Settings
            </Button>
          )}

          {data.status === 'stale' && params.id && (
            <Button
              size="xs"
              variant="light"
              color="orange"
              leftSection={<IconRefresh size={14} />}
              loading={buildIndex.isPending}
              onClick={() => { buildIndex.mutate(params.id!); }}
            >
              Rebuild Index
            </Button>
          )}

          {!data.provider.connected && data.provider.configured && (
            <Button
              size="xs"
              variant="light"
              color="blue"
              leftSection={<IconPlugConnected size={14} />}
              loading={testConnection.isPending}
              onClick={() => { testConnection.mutate(); }}
            >
              Test Connection
            </Button>
          )}

          {data.status === 'ready' && (
            <Text size="xs" c="dimmed" ta="center">
              All systems operational
            </Text>
          )}
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}
