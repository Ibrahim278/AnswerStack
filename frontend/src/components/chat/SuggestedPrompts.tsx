import { useState, useEffect } from 'react';
import { SimpleGrid, Button, Box } from '@mantine/core';

const STATIC_PROMPTS = [
  'What are the main topics covered?',
  'Summarize the key findings',
  'What are the most important conclusions?',
  'Explain the methodology used',
];

interface SuggestedPromptsProps {
  dynamicPrompts?: string[];
  isLoading: boolean;
  onSelect: (prompt: string) => void;
}

export function SuggestedPrompts({ dynamicPrompts, isLoading, onSelect }: SuggestedPromptsProps) {
  const [showDynamic, setShowDynamic] = useState(false);

  const prompts = showDynamic && dynamicPrompts?.length ? dynamicPrompts : STATIC_PROMPTS;

  // D-50: fade-swap when dynamic prompts arrive
  useEffect(() => {
    if (dynamicPrompts?.length && !isLoading) {
      // Small delay for fade effect
      const timer = setTimeout(() => setShowDynamic(true), 100);
      return () => clearTimeout(timer);
    }
  }, [dynamicPrompts, isLoading]);

  return (
    <Box
      style={{
        opacity: showDynamic ? 1 : 0.9,
        transition: 'opacity 300ms ease',
      }}
    >
      <SimpleGrid cols={{ base: 2, sm: 2 }} spacing="sm">
        {prompts.map((prompt) => (
          <Button
            key={prompt}
            variant="light"
            color="gray"
            size="sm"
            onClick={() => onSelect(prompt)}
            style={{
              whiteSpace: 'normal',
              height: 'auto',
              padding: 'var(--mantine-spacing-sm) var(--mantine-spacing-md)',
              textAlign: 'left',
            }}
          >
            {prompt}
          </Button>
        ))}
      </SimpleGrid>
    </Box>
  );
}
