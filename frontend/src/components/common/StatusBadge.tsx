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
import { isValidUuid } from '../../utils/isValidUuid';

const STATUS_CONFIG: Record<string, { color: string; label: string; bg: string; text: string; border: string }> = {
  ready: {
    color: 'green',
    label: 'Ready',
    bg: 'rgba(18, 128, 109, 0.14)',
    text: '#0f5147',
    border: 'rgba(18, 128, 109, 0.22)',
  },
  indexing: {
    color: 'blue',
    label: 'Indexing',
    bg: 'rgba(20, 92, 176, 0.12)',
    text: '#124a87',
    border: 'rgba(20, 92, 176, 0.18)',
  },
  misconfigured: {
    color: 'red',
    label: 'Setup needed',
    bg: 'rgba(176, 44, 44, 0.12)',
    text: '#8d2424',
    border: 'rgba(176, 44, 44, 0.18)',
  },
  degraded: {
    color: 'yellow',
    label: 'Attention',
    bg: 'rgba(173, 118, 22, 0.14)',
    text: '#7a4d0d',
    border: 'rgba(173, 118, 22, 0.2)',
  },
  no_documents: {
    color: 'gray',
    label: 'No docs yet',
    bg: 'rgba(73, 91, 82, 0.12)',
    text: '#33463e',
    border: 'rgba(73, 91, 82, 0.16)',
  },
  stale: {
    color: 'orange',
    label: 'Needs rebuild',
    bg: 'rgba(183, 111, 21, 0.14)',
    text: '#7f4b08',
    border: 'rgba(183, 111, 21, 0.2)',
  },
};

function getStatusConfig(status: string) {
  return STATUS_CONFIG[status] ?? {
    color: 'gray',
    label: status,
    bg: 'rgba(73, 91, 82, 0.12)',
    text: '#33463e',
    border: 'rgba(73, 91, 82, 0.16)',
  };
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
  const routeHasProjectParam = typeof params.id === 'string';
  const projectId = isValidUuid(params.id) ? params.id : undefined;
  const { data } = useSystemStatus(routeHasProjectParam ? projectId ?? '' : undefined);
  const buildIndex = useBuildIndex();
  const testConnection = useTestConnection();

  if (routeHasProjectParam && !projectId) {
    return (
      <Badge color="gray" variant="light" size="lg" radius="xl">
        Link issue
      </Badge>
    );
  }

  if (!data) {
    return (
      <Badge color="gray" variant="dot" size="sm">
        Loading
      </Badge>
    );
  }

  const { color, label } = getStatusConfig(data.status);
  const badgeTone = getStatusConfig(data.status);
  const isIndexing = data.status === 'indexing';

  return (
    <Popover opened={opened} onChange={setOpened} position="bottom-end" withArrow shadow="md">
      <Popover.Target>
        <Badge
          color={color}
          variant="light"
          size="lg"
          radius="xl"
          style={{
            cursor: 'pointer',
            background: badgeTone.bg,
            color: badgeTone.text,
            border: `1px solid ${badgeTone.border}`,
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
                    ? 'Needs rebuild'
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
