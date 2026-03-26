import { useState } from 'react';
import { Box, NavLink, Text } from '@mantine/core';
import { IconMessage } from '@tabler/icons-react';
import { useNavigate } from 'react-router';
import type { ChatSessionResponse } from '../../types';
import { SessionMenu } from './SessionMenu';
import { InlineSessionName } from './InlineSessionName';

interface SessionItemProps {
  session: ChatSessionResponse;
  projectId: string;
  isActive: boolean;
}

export function SessionItem({ session, projectId, isActive }: SessionItemProps) {
  const navigate = useNavigate();
  const [menuOpened, setMenuOpened] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);

  if (isRenaming) {
    return (
      <InlineSessionName
        projectId={projectId}
        sessionId={session.id}
        currentTitle={session.title}
        onDone={() => setIsRenaming(false)}
      />
    );
  }

  return (
    <NavLink
      active={isActive}
      onClick={() => { void navigate(`/projects/${projectId}/chat/${session.id}`); }}
      label={(
        <Text fw={isActive ? 700 : 500} lineClamp={1}>
          {session.title}
        </Text>
      )}
      leftSection={<IconMessage size={18} />}
      rightSection={(
        <Box
          px={4}
          py={2}
          style={{
            borderRadius: '999px',
            background: menuOpened || isActive ? 'rgba(32, 169, 152, 0.12)' : 'transparent',
          }}
        >
          <SessionMenu
            projectId={projectId}
            sessionId={session.id}
            opened={menuOpened}
            onOpenChange={setMenuOpened}
            onRename={() => setIsRenaming(true)}
          />
        </Box>
      )}
      px="xs"
      styles={{
        root: {
          borderRadius: '18px',
          minHeight: '44px',
        },
        label: {
          minWidth: 0,
        },
      }}
    />
  );
}
