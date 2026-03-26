import { useState, useRef, useEffect, useCallback } from 'react';
import { Textarea, ActionIcon, Group, Box, Text } from '@mantine/core';
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
    <Box className="chat-composer-shell">
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
          maxRows={7}
          style={{ flex: 1 }}
          aria-label="Ask a question"
          aria-describedby={disabled ? 'composer-disabled-reason' : undefined}
          radius="xl"
          styles={{
            input: {
              background: 'rgba(255,255,255,0.92)',
              borderColor: 'rgba(32, 59, 48, 0.14)',
              paddingTop: '14px',
              paddingBottom: '14px',
            },
          }}
        />
        {isStreaming ? (
          <ActionIcon
            size="xl"
            color="red"
            variant="filled"
            onClick={onStop}
            aria-label="Stop generation"
            radius="xl"
          >
            <IconPlayerStop size={20} />
          </ActionIcon>
        ) : (
          <ActionIcon
            size="xl"
            color="ocean"
            variant="filled"
            onClick={handleSend}
            disabled={!canSend}
            aria-label="Send message"
            radius="xl"
          >
            <IconSend size={20} />
          </ActionIcon>
        )}
      </Group>
      <Group justify="space-between" mt="xs" px={4} className="chat-composer-meta">
        <Text className="chat-composer-hint">
          `Enter` sends, `Shift+Enter` adds a new line.
        </Text>
        <Text className="chat-composer-hint">
          Press `/` to focus the composer.
        </Text>
      </Group>
    </Box>
  );
}
