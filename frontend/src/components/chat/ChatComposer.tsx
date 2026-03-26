import { useState, useRef, useEffect, useCallback } from 'react';
import { Textarea, ActionIcon, Group, Box } from '@mantine/core';
import { IconSend, IconPlayerStop } from '@tabler/icons-react';

interface ChatComposerProps {
  onSend: (question: string) => void;
  onStop: () => void;
  isStreaming: boolean;
  disabled?: boolean; // Provider not configured
}

export function ChatComposer({ onSend, onStop, isStreaming, disabled = false }: ChatComposerProps) {
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const canSend = value.trim().length > 0 && !isStreaming && !disabled;

  const handleSend = useCallback(() => {
    if (!canSend) return;
    const question = value.trim();
    setValue('');
    onSend(question);
  }, [canSend, value, onSend]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Enter sends (D-52), Shift+Enter for newline
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
    // Escape stops stream (D-56)
    if (e.key === 'Escape' && isStreaming) {
      onStop();
    }
  };

  // D-56: "/" focuses composer when empty and not focused
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === '/' && document.activeElement !== textareaRef.current && !value) {
        e.preventDefault();
        textareaRef.current?.focus();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [value]);

  return (
    <Box
      style={{
        position: 'sticky',
        bottom: 0,
        padding: 'var(--mantine-spacing-md)',
        backgroundColor: 'var(--mantine-color-body)',
        borderTop: '1px solid var(--mantine-color-default-border)',
      }}
    >
      <Group gap="sm" align="flex-end" wrap="nowrap">
        <Textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.currentTarget.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask a question..."
          disabled={disabled}
          autosize
          minRows={1}
          maxRows={5}
          style={{ flex: 1 }}
          aria-label="Ask a question"
          aria-describedby={disabled ? 'composer-disabled-reason' : undefined}
        />
        {isStreaming ? (
          <ActionIcon
            size="lg"
            color="red"
            variant="filled"
            onClick={onStop}
            aria-label="Stop generation"
          >
            <IconPlayerStop size={20} />
          </ActionIcon>
        ) : (
          <ActionIcon
            size="lg"
            color="blue"
            variant="filled"
            onClick={handleSend}
            disabled={!canSend}
            aria-label="Send message"
          >
            <IconSend size={20} />
          </ActionIcon>
        )}
      </Group>
    </Box>
  );
}
