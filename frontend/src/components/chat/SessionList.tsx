import { Stack, Text, Button, Tooltip, Divider, NavLink, Skeleton } from '@mantine/core';
import { IconPlus, IconMessage } from '@tabler/icons-react';
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

  const handleNewChat = () => {
    void navigate(`/projects/${projectId}/chat`);
  };

  if (sidebarCollapsed) {
    return (
      <Stack gap={0}>
        <Divider my="xs" />
        <Tooltip label="New Chat" position="right" withArrow>
          <Button
            variant="light"
            size="compact-md"
            fullWidth
            onClick={handleNewChat}
            aria-label="New Chat"
            mx="xs"
          >
            <IconPlus size={18} />
          </Button>
        </Tooltip>
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
    <Stack gap={0}>
      <Divider
        my="xs"
        label={<Text size="xs" fw={700} c="dimmed" tt="uppercase">Sessions</Text>}
        labelPosition="left"
      />
      <Button
        leftSection={<IconPlus size={16} />}
        variant="light"
        size="compact-md"
        fullWidth
        onClick={handleNewChat}
        mx="xs"
        mb="xs"
      >
        New Chat
      </Button>
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
