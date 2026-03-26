import { useRef, useEffect, useState, useCallback } from 'react';
import { Stack, ScrollArea, Box } from '@mantine/core';
import type { ChatMessageResponse } from '../../types';
import { useChatStore } from '../../stores/chatStore';
import { ChatMessage } from './ChatMessage';
import { StreamingMessage } from './StreamingMessage';
import { ChatErrorAlert } from './ChatErrorAlert';
import { ScrollToBottom } from './ScrollToBottom';

interface ChatMessageListProps {
  messages: ChatMessageResponse[];
  onRetry: () => void;
}

export function ChatMessageList({ messages, onRetry }: ChatMessageListProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const { isStreaming, streamError, streamPhase, accumulatedTokens } = useChatStore();

  // Find last assistant message index for retry button
  const lastAssistantIdx = messages.reduce(
    (acc, msg, idx) => (msg.role === 'assistant' ? idx : acc),
    -1,
  );

  // Smart auto-scroll (D-41)
  const scrollToBottom = useCallback(() => {
    if (viewportRef.current) {
      viewportRef.current.scrollTop = viewportRef.current.scrollHeight;
    }
  }, []);

  // Auto-scroll on new content
  useEffect(() => {
    if (autoScroll) {
      scrollToBottom();
    }
  }, [messages.length, accumulatedTokens, autoScroll, scrollToBottom]);

  // D-47: scroll to bottom on initial load
  useEffect(() => {
    scrollToBottom();
  }, [scrollToBottom]);

  // Detect user scroll-up to pause auto-scroll
  const handleScroll = useCallback(() => {
    if (!viewportRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = viewportRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
    setAutoScroll(isAtBottom);
    setShowScrollButton(!isAtBottom);
  }, []);

  const handleScrollToBottom = useCallback(() => {
    setAutoScroll(true);
    scrollToBottom();
  }, [scrollToBottom]);

  return (
    <Box style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
      <ScrollArea
        h="100%"
        viewportRef={viewportRef}
        onScrollPositionChange={handleScroll}
      >
        <Stack
          gap="md"
          p="lg"
          role="log"
          aria-label="Chat messages"
          style={{ maxWidth: '100%' }}
        >
          {messages.map((msg, idx) => (
            <Box key={msg.id} role="listitem">
              <ChatMessage
                message={msg}
                isLastAssistant={idx === lastAssistantIdx}
                onRetry={idx === lastAssistantIdx ? onRetry : undefined}
              />
            </Box>
          ))}

          {/* Streaming message */}
          {isStreaming && <StreamingMessage />}

          {/* Stream error (D-37) */}
          {streamError && (
            <ChatErrorAlert message={streamError.message} onRetry={onRetry} />
          )}

          {/* Aria-live region for screen reader announcements (D-90) */}
          {streamPhase === 'complete' && (
            <Box aria-live="polite" style={{ position: 'absolute', left: '-9999px' }}>
              Answer received with {useChatStore.getState().currentSources.length} sources
            </Box>
          )}
        </Stack>
      </ScrollArea>

      {/* Scroll to bottom button (D-41) */}
      <ScrollToBottom visible={showScrollButton} onClick={handleScrollToBottom} />
    </Box>
  );
}
