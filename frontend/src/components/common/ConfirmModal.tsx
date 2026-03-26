import type { ReactNode } from 'react';
import { Modal, Text, Group, Button, Stack } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';

interface ConfirmModalProps {
  opened: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  confirmColor?: string;
  loading?: boolean;
  icon?: ReactNode;
}

export function ConfirmModal({
  opened,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Confirm',
  confirmColor = 'red',
  loading = false,
  icon,
}: ConfirmModalProps) {
  const isMobile = useMediaQuery('(max-width: 48em)');

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={
        <Group gap="xs" wrap="nowrap">
          {icon}
          <Text fw={600}>{title}</Text>
        </Group>
      }
      fullScreen={isMobile ?? false}
      centered
    >
      <Stack gap="lg">
        <Text size="sm" c="dimmed">
          {message}
        </Text>
        <Group justify="flex-end" gap="sm">
          <Button variant="default" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button color={confirmColor} onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
