import { useEffect, useRef, useState } from 'react';
import { Box, Group, Text, CloseButton } from '@mantine/core';
import { useChatStore } from '../../stores/chatStore';
import type { SSESourceItem, ChatMessageResponse } from '../../types';
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

  // Find sources for active message
  const activeMessage = messages.find((m) => m.id === activeSourceMsgId);
  // Handle sources_json being either an array or a JSON string from the API
  const rawSources = activeMessage?.sources_json;
  const sources: SSESourceItem[] = Array.isArray(rawSources)
    ? rawSources
    : typeof rawSources === 'string'
      ? (JSON.parse(rawSources) as SSESourceItem[])
      : EMPTY_SOURCES;

  // Also check streaming state for sources (active or just-completed stream)
  const streamingMsgId = useChatStore((s) => s.streamingMessageId);
  const currentSources = useChatStore((s) => s.currentSources);
  const streamingSources = streamingMsgId === activeSourceMsgId ? currentSources : EMPTY_SOURCES;
  const displaySources = sources.length > 0 ? sources : streamingSources;

  // D-21: Listen for citation-click events to scroll to card
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      const sourceNumber = detail?.sourceNumber;
      if (typeof sourceNumber === 'number') {
        setHighlightedSource(sourceNumber);
        setTimeout(() => {
          const card = scrollContainerRef.current?.querySelector(
            `[data-source-index="${sourceNumber}"]`,
          );
          card?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
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

  if (!sourcePanelOpen) {
    return null;
  }

  return (
    <Box
      role="complementary"
      aria-label="Source evidence"
      tabIndex={0}
      style={{
        width: '380px',
        minWidth: '380px',
        overflow: 'hidden',
        borderLeft: '1px solid var(--mantine-color-default-border)',
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
      <div
        ref={scrollContainerRef}
        style={{ flex: 1, overflowY: 'auto', padding: 'var(--mantine-spacing-md)' }}
      >
        {displaySources.length === 0 ? (
          <SourcePanelEmpty />
        ) : (
          <Box style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {displaySources
              .slice()
              .sort((a, b) => b.relevance_score - a.relevance_score)
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
      </div>
    </Box>
  );
}
