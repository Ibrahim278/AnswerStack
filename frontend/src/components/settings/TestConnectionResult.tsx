import { useState } from 'react';
import { Button, Stack, Group, Badge, Text } from '@mantine/core';
import { IconPlugConnected } from '@tabler/icons-react';
import { useTestConnection } from '../../hooks/useProvider';
import type { ConnectionTestResult as ConnectionTestResultType, CapabilityResult } from '../../types';

function getCapabilityBadge(result: CapabilityResult | undefined, isPending: boolean) {
  if (isPending) {
    return <Badge color="gray" variant="light">Testing...</Badge>;
  }
  if (!result) return null;

  switch (result.status) {
    case 'pass':
      return <Badge color="green">Pass</Badge>;
    case 'fail':
      return <Badge color="red">Fail</Badge>;
    case 'skip':
      return <Badge color="gray" variant="outline">Skip</Badge>;
    default:
      return <Badge color="gray">{result.status}</Badge>;
  }
}

interface CapabilityRowProps {
  label: string;
  result: CapabilityResult | undefined;
  isPending: boolean;
}

function CapabilityRow({ label, result, isPending }: CapabilityRowProps) {
  return (
    <Group gap="sm" align="flex-start">
      <Text fw={600} size="sm" w={80}>
        {label}:
      </Text>
      {getCapabilityBadge(result, isPending)}
      {result?.status === 'fail' && result.message && (
        <Text size="xs" c="red" style={{ flex: 1 }}>
          {result.message}
        </Text>
      )}
    </Group>
  );
}

export function TestConnectionResult() {
  const testConnection = useTestConnection();
  const [results, setResults] = useState<ConnectionTestResultType | null>(null);

  const handleTest = () => {
    testConnection.mutate(undefined, {
      onSuccess: (data) => {
        setResults(data);
      },
    });
  };

  return (
    <Stack gap="sm">
      <Button
        variant="light"
        leftSection={<IconPlugConnected size={16} />}
        onClick={handleTest}
        loading={testConnection.isPending}
      >
        Test Connection
      </Button>

      {(testConnection.isPending || results) && (
        <Stack gap="xs" pl="sm">
          <CapabilityRow
            label="Auth"
            result={results?.auth}
            isPending={testConnection.isPending}
          />
          <CapabilityRow
            label="Chat"
            result={results?.chat}
            isPending={testConnection.isPending}
          />
          <CapabilityRow
            label="Embedding"
            result={results?.embedding}
            isPending={testConnection.isPending}
          />
        </Stack>
      )}
    </Stack>
  );
}
