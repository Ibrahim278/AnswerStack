import { useCallback, useEffect, useRef, useState } from 'react';
import { Box, Group, Text, CloseButton } from '@mantine/core';
import { useChatStore } from '../../stores/chatStore';
import type { SSESourceItem, ChatMessageResponse } from '../../types';
import { parseSources } from '../../utils/chatSources';
import { SourceCard } from './SourceCard';
import { SourcePanelEmpty } from './SourcePanelEmpty';

// Stable empty array to avoid re-creating on every render
const EMPTY_SOURCES: SSESourceItem[] = [];

interface SourcePanelProps {
  messages: ChatMessageResponse[];
}

export function SourcePanel({ messages }: SourcePanelProps) {
  // Use individual selectors to avoid subscribing to entire store (prevents infinite re-render loops)
  const sourcePanelOpen = useChatStore((s) => s.sourcePanelOpen);
  const activeSourceMsgId = useChatStore((s) => s.activeSourceMsgId);
  const closeSourcePanel = useChatStore((s) => s.closeSourcePanel);
  const [highlightedSource, setHighlightedSource] = useState<number | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const pendingCitationRef = useRef<{ messageId: string; sourceNumber: number } | null>(null);
  const clearHighlightTimeoutRef = useRef<number | null>(null);

  // Find sources for active message
  const activeMessage = messages.find((m) => m.id === activeSourceMsgId);
  const sources = activeMessage ? parseSources(activeMessage.sources_json) : EMPTY_SOURCES;

  // Also check streaming state for sources (active or just-completed stream)
  const streamingMsgId = useChatStore((s) => s.streamingMessageId);
  const currentSources = useChatStore((s) => s.currentSources);
  const streamingSources = streamingMsgId === activeSourceMsgId ? currentSources : EMPTY_SOURCES;
  const displaySources = sources.length > 0 ? sources : streamingSources;

  const scrollToSource = useCallback((sourceNumber: number) => {
    if (clearHighlightTimeoutRef.current) {
      window.clearTimeout(clearHighlightTimeoutRef.current);
    }

    setHighlightedSource(sourceNumber);

    requestAnimationFrame(() => {
      const card = scrollContainerRef.current?.querySelector<HTMLElement>(
        `[data-source-index="${sourceNumber}"]`,
      );
      if (!card) return;
      card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      card.focus({ preventScroll: true });
    });

    clearHighlightTimeoutRef.current = window.setTimeout(() => {
      setHighlightedSource(null);
      clearHighlightTimeoutRef.current = null;
    }, 3000);
  }, []);

  // D-21: Listen for citation-click events to scroll to card
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      const sourceNumber = detail?.sourceNumber;
      const messageId = detail?.messageId;

      if (typeof sourceNumber === 'number' && typeof messageId === 'string') {
        pendingCitationRef.current = { messageId, sourceNumber };

        if (sourcePanelOpen && activeSourceMsgId === messageId) {
          scrollToSource(sourceNumber);
          pendingCitationRef.current = null;
        }
      }
    };
    window.addEventListener('citation-click', handler);
    return () => window.removeEventListener('citation-click', handler);
  }, [activeSourceMsgId, scrollToSource, sourcePanelOpen]);

  useEffect(() => {
    const pendingCitation = pendingCitationRef.current;
    if (!pendingCitation || !sourcePanelOpen) return;
    if (activeSourceMsgId !== pendingCitation.messageId) return;
    if (pendingCitation.sourceNumber < 1 || pendingCitation.sourceNumber > displaySources.length) return;

    scrollToSource(pendingCitation.sourceNumber);
    pendingCitationRef.current = null;
  }, [activeSourceMsgId, displaySources.length, scrollToSource, sourcePanelOpen]);

  // D-92: Escape closes panel and returns focus to trigger
  useEffect(() => {
    if (!sourcePanelOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        closeSourcePanel();
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('keydown', handler, true);
    return () => document.removeEventListener('keydown', handler, true);
  }, [sourcePanelOpen, closeSourcePanel]);

  // Track which element triggered the panel open
  useEffect(() => {
    if (sourcePanelOpen) {
      triggerRef.current = document.activeElement as HTMLElement;
    }
  }, [sourcePanelOpen]);

  useEffect(() => () => {
    if (clearHighlightTimeoutRef.current) {
      window.clearTimeout(clearHighlightTimeoutRef.current);
    }
  }, []);

  if (!sourcePanelOpen) {
    return null;
  }

  return (
    <Box
      role="complementary"
      aria-label="Source evidence"
      tabIndex={0}
      className="source-panel chat-surface"
      style={{ display: 'flex', flexDirection: 'column' }}
    >
      {/* Header (D-23) */}
      <Box className="source-panel__header" style={{ flexShrink: 0 }}>
        <Group justify="space-between" align="flex-start" gap="sm">
          <Box>
            <Text fw={700} size="lg" component="h2">
              Sources ({displaySources.length})
            </Text>
            <Text size="sm" c="dimmed">
              Compare the exact excerpts that support the current answer.
            </Text>
          </Box>
          <CloseButton onClick={closeSourcePanel} aria-label="Close source panel" />
        </Group>
      </Box>

      {/* Source cards or empty state (D-29: independent scroll) */}
      <div ref={scrollContainerRef} className="source-panel__body">
        {displaySources.length === 0 ? (
          <SourcePanelEmpty />
        ) : (
          <Box style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {displaySources.map((source, idx) => (
              <SourceCard
                key={`${activeSourceMsgId}-${idx}`}
                source={source}
                index={idx}
                highlighted={highlightedSource === idx + 1}
              />
            ))}
          </Box>
        )}
      </div>
    </Box>
  );
}
