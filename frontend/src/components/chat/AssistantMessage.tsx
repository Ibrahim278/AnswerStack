import { memo, useMemo, useState } from 'react';
import { Box, Text, Table } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { IconInfoCircle } from '@tabler/icons-react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import type { ChatMessageResponse, SSESourceItem } from '../../types';
import { processCitations } from '../../utils/markdown';
import { CitationLink } from './CitationLink';
import { CodeBlockCopy } from './CodeBlockCopy';
import { SourceBadge } from './SourceBadge';
import { MessageActionBar } from './MessageActionBar';
import { MobileMessageActions } from './MobileMessageActions';

interface AssistantMessageProps {
  message: ChatMessageResponse;
  isLastAssistant: boolean;
  onRetry?: () => void;
}

/**
 * Left-aligned assistant message with full markdown rendering, citations,
 * source badge, and action bar (D-13, D-32, D-34, D-36, D-42, D-44, D-45, D-48, D-72).
 */
function AssistantMessageInner({ message, isLastAssistant, onRetry }: AssistantMessageProps) {
  const isMobile = useMediaQuery('(max-width: 48em)');
  const [hovered, setHovered] = useState(false);
  // Handle sources_json being either an array or a JSON string from the API
  const rawSources = message.sources_json;
  const sources: SSESourceItem[] = Array.isArray(rawSources)
    ? rawSources
    : typeof rawSources === 'string'
      ? (JSON.parse(rawSources) as SSESourceItem[])
      : [];
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

  // Relative timestamp on hover (D-36)
  const relativeTime = useMemo(() => {
    const date = new Date(message.created_at);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return 'Just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    return `${Math.floor(diffHr / 24)}d ago`;
  }, [message.created_at]);

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
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[rehypeHighlight]}
          components={components}
        >
          {processedContent}
        </Markdown>
      </Box>

      {/* Source badge (D-07, D-18) */}
      <SourceBadge messageId={message.id} sourceCount={sources.length} />

      {/* Timestamp on hover (D-36) */}
      {hovered && (
        <Text size="xs" c="dimmed" mt={2}>
          {relativeTime}
        </Text>
      )}

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
