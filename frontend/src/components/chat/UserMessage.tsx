import { memo } from 'react';
import { Box, Text } from '@mantine/core';
import Markdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import type { ChatMessageResponse } from '../../types';

interface UserMessageProps {
  message: ChatMessageResponse;
  timestamp: {
    label: string;
    title: string;
  };
}

/**
 * Right-aligned user message with basic markdown rendering (D-13, D-35).
 * Background: blue-0, max-width 720px.
 */
function UserMessageInner({ message, timestamp }: UserMessageProps) {
  return (
    <Box
      style={{
        display: 'flex',
        justifyContent: 'flex-end',
      }}
    >
      <Box style={{ maxWidth: '720px' }}>
        <Box
          p="sm"
          style={{
            backgroundColor: 'var(--mantine-color-blue-0)',
            borderRadius: 'var(--mantine-radius-md)',
            lineHeight: 1.6,
          }}
        >
          <Markdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
            {message.content}
          </Markdown>
        </Box>
        <Text
          size="xs"
          c="dimmed"
          mt={6}
          ta="right"
          className="chat-message-time chat-message-time--user"
          title={timestamp.title}
          aria-label={`Sent at ${timestamp.title}`}
        >
          {timestamp.label}
        </Text>
      </Box>
    </Box>
  );
}

export const UserMessage = memo(UserMessageInner);
