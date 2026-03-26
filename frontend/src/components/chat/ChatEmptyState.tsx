import { Stack, Center, Title, Text, ThemeIcon, Group } from '@mantine/core';
import { IconMessageCircle, IconBulb, IconSearch } from '@tabler/icons-react';
import { SuggestedPrompts } from './SuggestedPrompts';

interface ChatEmptyStateProps {
  projectName: string;
  suggestedPrompts?: string[];
  isSuggestedPromptsLoading: boolean;
  onPromptSelect: (prompt: string) => void;
}

export function ChatEmptyState({
  projectName,
  suggestedPrompts,
  isSuggestedPromptsLoading,
  onPromptSelect,
}: ChatEmptyStateProps) {
  return (
    <Center className="chat-empty" style={{ flex: 1 }}>
      <Stack align="center" gap="lg" maw={620} px="md">
        <ThemeIcon size={72} radius={24} variant="light" color="ocean">
          <IconMessageCircle size={34} stroke={1.7} />
        </ThemeIcon>
        <Title order={3} ta="center">
          Ask a question about {projectName}
        </Title>
        <Text ta="center" className="muted-copy" maw={520}>
          Start broad, then narrow with citations. Open the evidence panel any time to inspect the exact supporting chunks.
        </Text>
        <Group gap="sm">
          <span className="page-pill">
            <IconSearch size={16} />
            Retrieval before generation
          </span>
          <span className="page-pill">
            <IconBulb size={16} />
            Prompt ideas below
          </span>
        </Group>
        <SuggestedPrompts
          dynamicPrompts={suggestedPrompts}
          isLoading={isSuggestedPromptsLoading}
          onSelect={onPromptSelect}
        />
      </Stack>
    </Center>
  );
}
