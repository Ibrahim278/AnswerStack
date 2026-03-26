import { Alert, Button, Group } from '@mantine/core';
import { IconAlertCircle } from '@tabler/icons-react';

interface ChatErrorAlertProps {
  message: string;
  onRetry?: () => void;
}

/**
 * Inline error alert in chat flow (D-37, D-84, D-85).
 */
export function ChatErrorAlert({ message, onRetry }: ChatErrorAlertProps) {
  return (
    <Alert
      color="red"
      icon={<IconAlertCircle size={18} />}
      my="sm"
    >
      {message}
      {onRetry && (
        <Group mt="xs">
          <Button variant="light" color="red" size="xs" onClick={onRetry}>
            Retry
          </Button>
        </Group>
      )}
    </Alert>
  );
}
