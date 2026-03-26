import { memo, useMemo, useState } from 'react';
import { Box, Text, Table, Group } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { IconInfoCircle } from '@tabler/icons-react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeHighlight from 'rehype-highlight';
import rehypeKatex from 'rehype-katex';
import type { ChatMessageResponse, SSESourceItem } from '../../types';
import { processCitations } from '../../utils/markdown';
import { parseSources } from '../../utils/chatSources';
import { CitationLink } from './CitationLink';
import { CodeBlockCopy } from './CodeBlockCopy';
import { SourceBadge } from './SourceBadge';
import { MessageActionBar } from './MessageActionBar';
import { MobileMessageActions } from './MobileMessageActions';

interface AssistantMessageProps {
  message: ChatMessageResponse;
  isLastAssistant: boolean;
  onRetry?: () => void;
  timestamp: {
    label: string;
    title: string;
  };
}

/**
 * Left-aligned assistant message with full markdown rendering, citations,
 * source badge, and action bar (D-13, D-32, D-34, D-36, D-42, D-44, D-45, D-48, D-72).
 */
function AssistantMessageInner({ message, isLastAssistant, onRetry, timestamp }: AssistantMessageProps) {
  const isMobile = useMediaQuery('(max-width: 48em)');
  const [hovered, setHovered] = useState(false);
  const sources: SSESourceItem[] = parseSources(message.sources_json);
  const isNoContext = sources.length === 0;

  // Process citations in content (D-31, Pitfall 1)
  const processedContent = useMemo(() => processCitations(message.content), [message.content]);

  // Create markdown components with messageId bound to CitationLink
  const components = useMemo(() => ({
    a: (props: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
      <CitationLink {...props} messageId={message.id} />
    ),
    pre: ({ children }: { children?: React.ReactNode }) => (
      <CodeBlockCopy>{children}</CodeBlockCopy>
    ),
    table: ({ children }: { children?: React.ReactNode }) => (
      <div style={{ overflowX: 'auto' }}>
        <Table striped>{children}</Table>
      </div>
    ),
    // No images (D-40)
    img: ({ alt }: { alt?: string }) => <span>{alt ?? ''}</span>,
  }), [message.id]);

  return (
    <Box
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ position: 'relative' }}
    >
      <Box
        p="sm"
        style={{
          maxWidth: '720px',
          lineHeight: 1.6,
          fontSize: '16px',
          color: isNoContext ? 'var(--mantine-color-dimmed)' : undefined,
        }}
      >
        {/* No-context indicator (D-34) */}
        {isNoContext && (
          <Box mb="xs" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <IconInfoCircle size={18} style={{ color: 'var(--mantine-color-dimmed)' }} />
          </Box>
        )}

        {/* Markdown content (D-32, D-44) */}
        <Markdown
          remarkPlugins={[remarkGfm, remarkMath]}
          rehypePlugins={[rehypeHighlight, rehypeKatex]}
          components={components}
        >
          {processedContent}
        </Markdown>
      </Box>

      <Group className="chat-message-meta" justify="space-between" align="center" wrap="wrap" mt="xs">
        <SourceBadge messageId={message.id} sourceCount={sources.length} />
        <Text
          size="xs"
          c="dimmed"
          className="chat-message-time"
          title={timestamp.title}
          aria-label={`Sent at ${timestamp.title}`}
        >
          {timestamp.label}
        </Text>
      </Group>

      {/* Action bar -- desktop: hover, mobile: always visible (D-48, D-98) */}
      {isMobile ? (
        <MobileMessageActions
          content={message.content}
          onRetry={onRetry}
          showRetry={isLastAssistant}
        />
      ) : (
        <Box
          pos="absolute"
          bottom={0}
          right={0}
          style={{ opacity: hovered ? 1 : 0, transition: 'opacity 150ms ease' }}
        >
          <MessageActionBar
            content={message.content}
            onRetry={onRetry}
            showRetry={isLastAssistant}
          />
        </Box>
      )}
    </Box>
  );
}

// React.memo for completed messages -- only streaming message re-renders (D-72)
export const AssistantMessage = memo(AssistantMessageInner);
