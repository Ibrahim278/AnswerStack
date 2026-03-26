import { useMemo } from 'react';
import { Box, Table } from '@mantine/core';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { useChatStore } from '../../stores/chatStore';
import { processCitations } from '../../utils/markdown';
import { CitationLink } from './CitationLink';
import { CodeBlockCopy } from './CodeBlockCopy';
import { SourceBadge } from './SourceBadge';
import { StreamPhaseIndicator } from './StreamPhaseIndicator';

/**
 * Active streaming message: token accumulation + pulsing cursor + phase indicator (D-16, D-44).
 * Re-renders on each token via Zustand store subscription.
 */
export function StreamingMessage() {
  const {
    streamingMessageId,
    accumulatedTokens,
    currentSources,
    streamPhase,
  } = useChatStore();

  const processedContent = useMemo(
    () => processCitations(accumulatedTokens),
    [accumulatedTokens],
  );

  const components = useMemo(() => ({
    a: (props: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
      <CitationLink {...props} messageId={streamingMessageId ?? ''} />
    ),
    pre: ({ children }: { children?: React.ReactNode }) => (
      <CodeBlockCopy>{children}</CodeBlockCopy>
    ),
    table: ({ children }: { children?: React.ReactNode }) => (
      <div style={{ overflowX: 'auto' }}>
        <Table striped>{children}</Table>
      </div>
    ),
    img: ({ alt }: { alt?: string }) => <span>{alt ?? ''}</span>,
  }), [streamingMessageId]);

  if (!streamingMessageId) return null;

  return (
    <Box>
      {/* Phase indicator (D-17) */}
      {(streamPhase === 'searching' || streamPhase === 'generating') && !accumulatedTokens && (
        <StreamPhaseIndicator phase={streamPhase} />
      )}

      {/* Streaming content (D-16, D-44) */}
      {accumulatedTokens && (
        <Box
          p="sm"
          style={{
            maxWidth: '720px',
            lineHeight: 1.6,
            fontSize: '16px',
          }}
        >
          <Markdown
            remarkPlugins={[remarkGfm]}
            rehypePlugins={[rehypeHighlight]}
            components={components}
          >
            {processedContent}
          </Markdown>

          {/* Pulsing block cursor (D-16) */}
          <Box
            component="span"
            aria-hidden="true"
            style={{
              display: 'inline-block',
              width: '8px',
              height: '18px',
              backgroundColor: 'var(--mantine-color-blue-6)',
              marginLeft: '2px',
              verticalAlign: 'text-bottom',
              animation: 'cursorPulse 1s ease-in-out infinite',
            }}
          />
          <style>{`
            @keyframes cursorPulse {
              0%, 100% { opacity: 1; }
              50% { opacity: 0.4; }
            }
            @media (prefers-reduced-motion: reduce) {
              @keyframes cursorPulse {
                0%, 100% { opacity: 1; }
              }
            }
          `}</style>
        </Box>
      )}

      {/* Source badge appears as soon as sources arrive (D-18) */}
      {currentSources.length > 0 && streamingMessageId && (
        <SourceBadge messageId={streamingMessageId} sourceCount={currentSources.length} />
      )}
    </Box>
  );
}
