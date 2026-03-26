import { useEffect, useRef, useState } from 'react';
import { Box, Group, Text, ScrollArea, CloseButton } from '@mantine/core';
import { useFocusTrap } from '@mantine/hooks';
import { useChatStore } from '../../stores/chatStore';
import type { SSESourceItem, ChatMessageResponse } from '../../types';
import { SourceCard } from './SourceCard';
import { SourcePanelEmpty } from './SourcePanelEmpty';

interface SourcePanelProps {
  messages: ChatMessageResponse[];
}

export function SourcePanel({ messages }: SourcePanelProps) {
  const { sourcePanelOpen, activeSourceMsgId, closeSourcePanel } = useChatStore();
  const [highlightedSource, setHighlightedSource] = useState<number | null>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const focusTrapRef = useFocusTrap(sourcePanelOpen);
  const triggerRef = useRef<HTMLElement | null>(null);

  // Find sources for active message
  const activeMessage = messages.find((m) => m.id === activeSourceMsgId);
  const sources: SSESourceItem[] = (activeMessage?.sources_json as SSESourceItem[]) ?? [];

  // Also check streaming state for sources
  const streamingSources = useChatStore((s) =>
    s.streamingMessageId === activeSourceMsgId ? s.currentSources : [],
  );
  const displaySources = sources.length > 0 ? sources : streamingSources;

  // D-21: Listen for citation-click events to scroll to card
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      const sourceNumber = detail?.sourceNumber;
      if (typeof sourceNumber === 'number') {
        setHighlightedSource(sourceNumber);
        // Wait for panel animation to finish (D-09: 200ms), then scroll
        setTimeout(() => {
          const card = scrollAreaRef.current?.querySelector(
            `[data-source-index="${sourceNumber}"]`,
          );
          card?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          // Clear highlight after 3s
          setTimeout(() => setHighlightedSource(null), 3000);
        }, 220);
      }
    };
    window.addEventListener('citation-click', handler);
    return () => window.removeEventListener('citation-click', handler);
  }, []);

  // D-92: Escape closes panel and returns focus to trigger
  useEffect(() => {
    if (!sourcePanelOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeSourcePanel();
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [sourcePanelOpen, closeSourcePanel]);

  // Track which element triggered the panel open
  useEffect(() => {
    if (sourcePanelOpen) {
      triggerRef.current = document.activeElement as HTMLElement;
    }
  }, [sourcePanelOpen]);

  return (
    <Box
      ref={focusTrapRef}
      role="complementary"
      aria-label="Source evidence"
      style={{
        width: sourcePanelOpen ? '380px' : '0px',
        minWidth: sourcePanelOpen ? '380px' : '0px',
        overflow: 'hidden',
        transition: 'width 200ms ease-out, min-width 200ms ease-out',
        borderLeft: sourcePanelOpen ? '1px solid var(--mantine-color-default-border)' : 'none',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Header (D-23) */}
      <Group justify="space-between" p="md" style={{ borderBottom: '1px solid var(--mantine-color-default-border)', flexShrink: 0 }}>
        <Text fw={700} size="lg" component="h2">
          Sources ({displaySources.length})
        </Text>
        <CloseButton onClick={closeSourcePanel} aria-label="Close source panel" />
      </Group>

      {/* Source cards or empty state (D-29: independent scroll) */}
      <ScrollArea style={{ flex: 1 }} p="md" viewportRef={scrollAreaRef}>
        {displaySources.length === 0 ? (
          <SourcePanelEmpty />
        ) : (
          <Box style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {displaySources
              .slice()
              .sort((a, b) => b.relevance_score - a.relevance_score) // D-20: ordered by relevance
              .map((source, idx) => (
                <SourceCard
                  key={`${activeSourceMsgId}-${idx}`}
                  source={source}
                  index={idx}
                  highlighted={highlightedSource === idx + 1}
                />
              ))}
          </Box>
        )}
      </ScrollArea>
    </Box>
  );
}
