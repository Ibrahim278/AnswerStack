import { Stack, Text, Tooltip, NavLink, Skeleton } from '@mantine/core';
import { IconMessage } from '@tabler/icons-react';
import { useNavigate, useParams } from 'react-router';
import { useSessionList } from '../../hooks/useSessions';
import { useUiStore } from '../../stores/uiStore';
import { SessionItem } from './SessionItem';

interface SessionListProps {
  projectId: string;
}

export function SessionList({ projectId }: SessionListProps) {
  const navigate = useNavigate();
  const sidebarCollapsed = useUiStore((s) => s.sidebarCollapsed);
  const { data: sessions, isLoading } = useSessionList(projectId);
  const params = useParams();
  const activeSessionId = params.sessionId;

  if (sidebarCollapsed) {
    return (
      <Stack gap="xs" className="sidebar-chat-list">
        {sessions?.map((session) => (
          <Tooltip key={session.id} label={session.title} position="right" withArrow>
            <NavLink
              active={activeSessionId === session.id}
              onClick={() => { void navigate(`/projects/${projectId}/chat/${session.id}`); }}
              label=""
              leftSection={<IconMessage size={18} />}
              aria-label={session.title}
              px="xs"
            />
          </Tooltip>
        ))}
      </Stack>
    );
  }

  return (
    <Stack gap="xs" className="sidebar-chat-list">
      {isLoading && (
        <Stack gap="xs" px="xs">
          <Skeleton height={32} radius="sm" />
          <Skeleton height={32} radius="sm" />
        </Stack>
      )}
      {!isLoading && (!sessions || sessions.length === 0) && (
        <Text size="sm" c="dimmed" ta="center" py="sm">
          No chat sessions
        </Text>
      )}
      {sessions?.map((session) => (
        <SessionItem
          key={session.id}
          session={session}
          projectId={projectId}
          isActive={activeSessionId === session.id}
        />
      ))}
    </Stack>
  );
}
