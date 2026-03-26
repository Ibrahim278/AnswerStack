import { useState, useRef, useEffect } from 'react';
import { TextInput } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useRenameSession } from '../../hooks/useSessions';

interface InlineSessionNameProps {
  projectId: string;
  sessionId: string;
  currentTitle: string;
  onDone: () => void;
}

export function InlineSessionName({ projectId, sessionId, currentTitle, onDone }: InlineSessionNameProps) {
  const [value, setValue] = useState(currentTitle);
  const inputRef = useRef<HTMLInputElement>(null);
  const renameSession = useRenameSession(projectId);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const handleSave = () => {
    const trimmed = value.trim();
    if (!trimmed || trimmed === currentTitle) {
      onDone();
      return;
    }
    renameSession.mutate(
      { sessionId, title: trimmed },
      {
        onSuccess: () => onDone(),
        onError: () => {
          notifications.show({
            title: 'Failed to rename',
            message: 'Could not rename session. Please try again.',
            color: 'red',
            autoClose: 5000,
          });
          onDone();
        },
      },
    );
  };

  return (
    <TextInput
      ref={inputRef}
      value={value}
      onChange={(e) => setValue(e.currentTarget.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') handleSave();
        if (e.key === 'Escape') { e.stopPropagation(); onDone(); }
      }}
      onBlur={handleSave}
      size="xs"
      mx="xs"
      my={2}
    />
  );
}
