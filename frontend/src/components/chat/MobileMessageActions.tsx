import { useState } from 'react';
import { Group, ActionIcon, Tooltip } from '@mantine/core';
import { IconCopy, IconCheck, IconRefresh } from '@tabler/icons-react';
import { stripMarkdownAndCitations } from '../../utils/markdown';

interface MobileMessageActionsProps {
  content: string;
  onRetry?: () => void;
  showRetry: boolean;
}

/**
 * Always-visible action buttons below assistant messages on mobile (D-98).
 */
export function MobileMessageActions({ content, onRetry, showRetry }: MobileMessageActionsProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    const plainText = stripMarkdownAndCitations(content);
    void navigator.clipboard.writeText(plainText).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <Group
      gap="xs"
      mt="sm"
      px={4}
      py={4}
      style={{
        width: 'fit-content',
        borderRadius: '999px',
        background: 'rgba(255, 255, 255, 0.9)',
        border: '1px solid rgba(32, 59, 48, 0.1)',
      }}
    >
      <Tooltip label={copied ? 'Copied!' : 'Copy'} position="top">
        <ActionIcon variant="subtle" size="md" onClick={handleCopy} aria-label="Copy to clipboard" c="dimmed">
          {copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
        </ActionIcon>
      </Tooltip>
      {showRetry && onRetry && (
        <Tooltip label="Retry" position="top">
          <ActionIcon variant="subtle" size="md" onClick={onRetry} aria-label="Retry response" c="dimmed">
            <IconRefresh size={16} />
          </ActionIcon>
        </Tooltip>
      )}
    </Group>
  );
}
