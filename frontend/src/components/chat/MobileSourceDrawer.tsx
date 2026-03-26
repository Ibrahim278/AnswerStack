import { Drawer, Text, Box, ScrollArea } from '@mantine/core';
import { useChatStore } from '../../stores/chatStore';
import type { SSESourceItem, ChatMessageResponse } from '../../types';
import { SourceCard } from './SourceCard';
import { SourcePanelEmpty } from './SourcePanelEmpty';

// Stable empty array to avoid re-creating on every render (React 19 / Zustand compat)
const EMPTY_SOURCES: SSESourceItem[] = [];

interface MobileSourceDrawerProps {
  messages: ChatMessageResponse[];
}

export function MobileSourceDrawer({ messages }: MobileSourceDrawerProps) {
  // Use individual selectors to avoid subscribing to entire store (prevents infinite re-render loops)
  const sourcePanelOpen = useChatStore((s) => s.sourcePanelOpen);
  const activeSourceMsgId = useChatStore((s) => s.activeSourceMsgId);
  const closeSourcePanel = useChatStore((s) => s.closeSourcePanel);

  const activeMessage = messages.find((m) => m.id === activeSourceMsgId);
  const sources: SSESourceItem[] = (activeMessage?.sources_json as SSESourceItem[]) ?? EMPTY_SOURCES;

  const streamingMsgId = useChatStore((s) => s.streamingMessageId);
  const currentSources = useChatStore((s) => s.currentSources);
  const streamingSources = streamingMsgId === activeSourceMsgId ? currentSources : EMPTY_SOURCES;
  const displaySources = sources.length > 0 ? sources : streamingSources;

  return (
    <Drawer
      opened={sourcePanelOpen}
      onClose={closeSourcePanel}
      position="bottom"
      size="70%"
      title={
        <Text fw={700} size="lg">Sources ({displaySources.length})</Text>
      }
      aria-label="Source evidence"
    >
      <ScrollArea h="100%">
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
                  highlighted={false}
                />
              ))}
          </Box>
        )}
      </ScrollArea>
    </Drawer>
  );
}
