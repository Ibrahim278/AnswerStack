import { Stack, Center, Title } from '@mantine/core';
import { IconMessageCircle } from '@tabler/icons-react';
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
    <Center style={{ flex: 1, minHeight: '300px' }}>
      <Stack align="center" gap="lg" maw={500} px="md">
        <IconMessageCircle size={48} style={{ color: 'var(--mantine-color-blue-6)' }} />
        <Title order={3} ta="center">
          Ask a question about {projectName}
        </Title>
        <SuggestedPrompts
          dynamicPrompts={suggestedPrompts}
          isLoading={isSuggestedPromptsLoading}
          onSelect={onPromptSelect}
        />
      </Stack>
    </Center>
  );
}
