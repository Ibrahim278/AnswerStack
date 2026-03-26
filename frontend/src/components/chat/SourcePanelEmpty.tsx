import { Stack, Center, Text } from '@mantine/core';
import { IconFileOff } from '@tabler/icons-react';

export function SourcePanelEmpty() {
  return (
    <Center h="100%">
      <Stack align="center" gap="md" p="xl">
        <IconFileOff size={48} style={{ color: 'var(--mantine-color-dimmed)' }} />
        <Text fw={700} size="lg">No sources found</Text>
        <Text c="dimmed" ta="center" size="sm">
          The answer was generated without supporting evidence from your documents.
        </Text>
      </Stack>
    </Center>
  );
}
