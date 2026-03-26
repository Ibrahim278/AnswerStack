import { Alert, Group, Button } from '@mantine/core';
import { IconAlertCircle } from '@tabler/icons-react';

interface ErrorAction {
  label: string;
  onClick: () => void;
  loading?: boolean;
}

interface ErrorBannerProps {
  title?: string;
  message: string;
  actions?: ErrorAction[];
  onDismiss?: () => void;
  color?: string;
}

export function ErrorBanner({
  title,
  message,
  actions,
  onDismiss,
  color = 'red',
}: ErrorBannerProps) {
  return (
    <Alert
      color={color}
      icon={<IconAlertCircle size={20} />}
      title={title}
      withCloseButton={!!onDismiss}
      onClose={onDismiss}
    >
      {message}
      {actions && actions.length > 0 && (
        <Group mt="sm" gap="xs">
          {actions.map((action) => (
            <Button
              key={action.label}
              variant="light"
              color={color}
              size="xs"
              onClick={action.onClick}
              loading={action.loading}
            >
              {action.label}
            </Button>
          ))}
        </Group>
      )}
    </Alert>
  );
}
