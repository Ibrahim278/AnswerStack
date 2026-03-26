import type { ReactNode } from 'react';
import { Stack, Center, Title, Text, Button, ThemeIcon } from '@mantine/core';

interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  description: string;
  action?: { label: string; onClick: () => void };
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <Center py="xl">
      <Stack align="center" gap="md" className="surface-card" p="xl" maw={560} mx="auto">
        <ThemeIcon size={72} radius={24} variant="light" color="ocean">
          {icon}
        </ThemeIcon>
        <Title order={3}>{title}</Title>
        <Text c="dimmed" ta="center" maw={400}>
          {description}
        </Text>
        {action && (
          <Button onClick={action.onClick}>{action.label}</Button>
        )}
      </Stack>
    </Center>
  );
}
