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
  const tone = getTone(color);
  return (
    <Alert
      color={color}
      icon={<IconAlertCircle size={20} />}
      title={title}
      withCloseButton={!!onDismiss}
      onClose={onDismiss}
      radius="xl"
      variant="light"
      className="project-error-banner"
      styles={{
        root: {
          background: tone.bg,
          border: `1px solid ${tone.border}`,
        },
        title: {
          color: tone.text,
        },
        body: {
          color: tone.text,
        },
        message: {
          color: tone.text,
        },
        icon: {
          color: tone.text,
        },
      }}
    >
      {message}
      {actions && actions.length > 0 && (
        <Group mt="sm" gap="xs">
          {actions.map((action) => (
            <Button
              key={action.label}
              variant="white"
              color={color}
              size="xs"
              onClick={action.onClick}
              loading={action.loading}
              styles={{
                root: {
                  color: tone.text,
                  border: `1px solid ${tone.border}`,
                },
              }}
            >
              {action.label}
            </Button>
          ))}
        </Group>
      )}
    </Alert>
  );
}

function getTone(color: string) {
  switch (color) {
    case 'orange':
      return {
        bg: 'rgba(183, 111, 21, 0.12)',
        text: '#7f4b08',
        border: 'rgba(183, 111, 21, 0.2)',
      };
    case 'blue':
      return {
        bg: 'rgba(20, 92, 176, 0.1)',
        text: '#124a87',
        border: 'rgba(20, 92, 176, 0.18)',
      };
    case 'yellow':
      return {
        bg: 'rgba(173, 118, 22, 0.12)',
        text: '#7a4d0d',
        border: 'rgba(173, 118, 22, 0.2)',
      };
    default:
      return {
        bg: 'rgba(176, 44, 44, 0.1)',
        text: '#8d2424',
        border: 'rgba(176, 44, 44, 0.18)',
      };
  }
}
