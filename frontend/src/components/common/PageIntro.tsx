import type { ReactNode } from 'react';
import { Box, Group, Stack, Text, Title } from '@mantine/core';

interface PageIntroProps {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  meta?: ReactNode;
}

export function PageIntro({
  eyebrow,
  title,
  description,
  actions,
  meta,
}: PageIntroProps) {
  return (
    <Box className="page-intro surface-card">
      <Group justify="space-between" align="flex-start" gap="lg">
        <Stack gap="sm" style={{ flex: 1, minWidth: 0 }}>
          {eyebrow && (
            <Text className="page-intro__eyebrow">
              {eyebrow}
            </Text>
          )}
          <Title order={1}>{title}</Title>
          {description && (
            <Text size="md" className="page-intro__description">
              {description}
            </Text>
          )}
          {meta && (
            <div className="page-intro__meta">
              {meta}
            </div>
          )}
        </Stack>

        {actions && (
          <Group gap="sm" justify="flex-end">
            {actions}
          </Group>
        )}
      </Group>
    </Box>
  );
}
