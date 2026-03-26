import { memo } from 'react';
import { Box } from '@mantine/core';
import Markdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import type { ChatMessageResponse } from '../../types';

interface UserMessageProps {
  message: ChatMessageResponse;
}

/**
 * Right-aligned user message with basic markdown rendering (D-13, D-35).
 * Background: blue-0, max-width 720px.
 */
function UserMessageInner({ message }: UserMessageProps) {
  return (
    <Box
      style={{
        display: 'flex',
        justifyContent: 'flex-end',
      }}
    >
      <Box
        p="sm"
        style={{
          backgroundColor: 'var(--mantine-color-blue-0)',
          borderRadius: 'var(--mantine-radius-md)',
          maxWidth: '720px',
          lineHeight: 1.6,
        }}
      >
        <Markdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
          {message.content}
        </Markdown>
      </Box>
    </Box>
  );
}

export const UserMessage = memo(UserMessageInner);
