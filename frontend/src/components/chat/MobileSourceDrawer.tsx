import { Drawer, Text, Box, ScrollArea } from '@mantine/core';
import { useChatStore } from '../../stores/chatStore';
import type { SSESourceItem, ChatMessageResponse } from '../../types';
import { SourceCard } from './SourceCard';
import { SourcePanelEmpty } from './SourcePanelEmpty';

interface MobileSourceDrawerProps {
  messages: ChatMessageResponse[];
}

export function MobileSourceDrawer({ messages }: MobileSourceDrawerProps) {
  const { sourcePanelOpen, activeSourceMsgId, closeSourcePanel } = useChatStore();

  const activeMessage = messages.find((m) => m.id === activeSourceMsgId);
  const sources: SSESourceItem[] = (activeMessage?.sources_json as SSESourceItem[]) ?? [];

  const streamingSources = useChatStore((s) =>
    s.streamingMessageId === activeSourceMsgId ? s.currentSources : [],
  );
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
