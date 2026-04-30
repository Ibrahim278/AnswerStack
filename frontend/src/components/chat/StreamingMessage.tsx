import { BookOpen } from 'lucide-react';
import { useChatStore } from '@/stores/chatStore';
import { useThrottledValue } from '@/hooks/useThrottledValue';
import { MarkdownRenderer } from '@/components/chat/MarkdownRenderer';
import { StreamPhaseIndicator } from '@/components/chat/StreamPhaseIndicator';

/**
 * Active streaming message: token accumulation + pulsing cursor + phase indicator.
 * Tokens are throttled at 100ms to avoid re-parsing markdown on every SSE token.
 */
export function StreamingMessage() {
  const streamingMessageId = useChatStore((s) => s.streamingMessageId);
  const accumulatedTokens = useChatStore((s) => s.accumulatedTokens);
  const currentSources = useChatStore((s) => s.currentSources);
  const streamPhase = useChatStore((s) => s.streamPhase);

  // Throttle the content fed to MarkdownRenderer so the expensive
  // markdown parse + rehype transform runs at most 10x/sec, not per token.
  const throttledTokens = useThrottledValue(accumulatedTokens, 100);

  if (!streamingMessageId) return null;

  return (
    <div>
      {/* Phase indicator: shows while waiting for tokens */}
      {(streamPhase === 'searching' || streamPhase === 'generating') && !accumulatedTokens && (
        <StreamPhaseIndicator phase={streamPhase} />
      )}

      {/* Streaming content with markdown */}
      {accumulatedTokens && (
        <div className="flex justify-start">
          <div className="max-w-[85%] rounded-xl px-4 py-3 bg-card border border-border">
            <MarkdownRenderer
              content={throttledTokens}
              messageId={streamingMessageId}
            />

            {/* Pulsing block cursor */}
            <span
              aria-hidden="true"
              className="inline-block w-2 h-[18px] bg-primary ml-0.5 align-text-bottom animate-cursor-pulse"
            />

            {/* Source indicator during streaming (no count — final count comes on message_complete) */}
            {currentSources.length > 0 && (
              <div className="mt-2 pt-2 border-t border-border">
                <span className="flex items-center gap-1 text-[11px] text-primary">
                  <BookOpen className="w-3 h-3" />
                  Sources found
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
