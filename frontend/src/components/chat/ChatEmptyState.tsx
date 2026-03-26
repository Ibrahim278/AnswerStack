import { Stack, Title, Text, ThemeIcon, Group, Box } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
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
  const isMobile = useMediaQuery('(max-width: 48em)');

  return (
    <Box className="chat-empty" style={{ width: '100%' }}>
      <Stack
        align="center"
        gap={isMobile ? 'sm' : 'lg'}
        maw={620}
        mx="auto"
        px={isMobile ? 'sm' : 'md'}
        py={isMobile ? 4 : 'md'}
      >
        <ThemeIcon size={isMobile ? 54 : 68} radius={isMobile ? 18 : 24} variant="light" color="ocean">
          <IconMessageCircle size={isMobile ? 28 : 32} stroke={1.7} />
        </ThemeIcon>
        <Title order={3} ta="center" maw={520} size={isMobile ? 'h4' : undefined}>
          Ask a question about {projectName}
        </Title>
        <Text ta="center" className="muted-copy" maw={520} size={isMobile ? 'sm' : undefined}>
          Start broad, then narrow with citations. Open the evidence panel whenever you want to inspect the supporting excerpts.
        </Text>
        <Group gap={isMobile ? 'xs' : 'sm'} justify="center">
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
    </Box>
  );
}
