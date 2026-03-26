import { useState } from 'react';
import { Group, ActionIcon, Tooltip } from '@mantine/core';
import { IconCopy, IconCheck, IconRefresh } from '@tabler/icons-react';
import { stripMarkdownAndCitations } from '../../utils/markdown';

interface MessageActionBarProps {
  content: string;
  onRetry?: () => void;
  showRetry: boolean;
}

/**
 * Hover action bar with Copy and Retry icons (D-48).
 * Appears on hover at bottom-right of assistant messages.
 */
export function MessageActionBar({ content, onRetry, showRetry }: MessageActionBarProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    const plainText = stripMarkdownAndCitations(content);
    void navigator.clipboard.writeText(plainText).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <Group gap="xs" className="message-action-bar">
      <Tooltip label={copied ? 'Copied!' : 'Copy'} position="top">
        <ActionIcon
          variant="subtle"
          size="sm"
          onClick={handleCopy}
          aria-label="Copy to clipboard"
        >
          {copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
        </ActionIcon>
      </Tooltip>
      {showRetry && onRetry && (
        <Tooltip label="Retry" position="top">
          <ActionIcon
            variant="subtle"
            size="sm"
            onClick={onRetry}
            aria-label="Retry response"
          >
            <IconRefresh size={16} />
          </ActionIcon>
        </Tooltip>
      )}
    </Group>
  );
}
