import { Badge, UnstyledButton } from '@mantine/core';
import { IconFileText } from '@tabler/icons-react';
import { useChatStore } from '../../stores/chatStore';

interface SourceBadgeProps {
  messageId: string;
  sourceCount: number;
}

/**
 * Clickable "N sources" badge below assistant messages (D-07, D-18).
 * Clicking opens source panel for that message.
 */
export function SourceBadge({ messageId, sourceCount }: SourceBadgeProps) {
  const openSourcePanel = useChatStore((s) => s.openSourcePanel);

  return (
    <UnstyledButton
      onClick={() => openSourcePanel(messageId)}
      aria-label={`${sourceCount} sources, click to view`}
    >
      <Badge
        leftSection={<IconFileText size={14} />}
        variant="light"
        color={sourceCount > 0 ? 'blue' : 'gray'}
        size="sm"
        style={{ cursor: 'pointer' }}
      >
        {sourceCount} {sourceCount === 1 ? 'source' : 'sources'}
      </Badge>
    </UnstyledButton>
  );
}
