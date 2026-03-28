import { useCallback, useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { useChatStore } from '@/stores/chatStore';
import type { SSESourceItem, ChatMessageResponse } from '@/types';
import { SourceCard } from './SourceCard';
import { SourcePanelEmpty } from './SourcePanelEmpty';
import { ScrollArea } from '@/components/ui/scroll-area';
import { TooltipProvider } from '@/components/ui/tooltip';

// Stable empty array to avoid re-creating on every render
const EMPTY_SOURCES: SSESourceItem[] = [];

interface SourcePanelProps {
  messages: ChatMessageResponse[];
}

export function SourcePanel({ messages }: SourcePanelProps) {
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
  const sources = activeMessage?.sources_json ?? EMPTY_SOURCES;

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

  // Listen for citation-click events to scroll to card
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

  // Escape closes panel and returns focus to trigger
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
    <div
      role="complementary"
      aria-label="Source evidence"
      tabIndex={0}
      className="w-[340px] h-full flex flex-col border-l border-border bg-surface-sunken shrink-0"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <div>
          <h3 className="font-semibold text-sm text-foreground">
            Sources ({displaySources.length})
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Evidence supporting the answer
          </p>
        </div>
        <button
          onClick={closeSourcePanel}
          aria-label="Close source panel"
          className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Source cards or empty state */}
      <ScrollArea className="flex-1">
        <div ref={scrollContainerRef} className="p-4">
          {displaySources.length === 0 ? (
            <SourcePanelEmpty />
          ) : (
            <TooltipProvider delayDuration={300}>
              <div className="flex flex-col gap-3">
                {displaySources.map((source, idx) => (
                  <SourceCard
                    key={`${activeSourceMsgId}-${idx}`}
                    source={source}
                    index={idx}
                    highlighted={highlightedSource === idx + 1}
                  />
                ))}
              </div>
            </TooltipProvider>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
