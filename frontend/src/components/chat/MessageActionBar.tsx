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
    <Group
      gap={6}
      className="message-action-bar"
      px={6}
      py={4}
      style={{
        borderRadius: '999px',
        background: 'rgba(255, 255, 255, 0.92)',
        border: '1px solid rgba(32, 59, 48, 0.1)',
        boxShadow: '0 8px 18px rgba(38, 55, 47, 0.12)',
      }}
    >
      <Tooltip label={copied ? 'Copied!' : 'Copy'} position="top">
        <ActionIcon
          variant="subtle"
          size="md"
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
            size="md"
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
