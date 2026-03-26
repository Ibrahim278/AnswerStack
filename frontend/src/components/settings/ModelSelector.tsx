import { useMemo } from 'react';
import { Select, Group, ActionIcon, Text } from '@mantine/core';
import { IconRefresh } from '@tabler/icons-react';
import { useProviderModels } from '../../hooks/useProvider';

interface ModelSelectorProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
}

export function ModelSelector({ label, value, onChange, error }: ModelSelectorProps) {
  const { data, isFetching, isError, error: fetchError, refetch } = useProviderModels();

  const selectData = useMemo(() => {
    if (!data?.models || data.models.length === 0) {
      // When models not yet fetched, show current value as only option
      return value ? [{ value, label: value }] : [];
    }

    // Check if there are multiple owners for grouping
    const owners = new Set(data.models.map((m) => m.owned_by));
    if (owners.size > 1) {
      return data.models.map((m) => ({
        value: m.id,
        label: m.id,
        group: m.owned_by,
      }));
    }

    return data.models.map((m) => ({
      value: m.id,
      label: m.id,
    }));
  }, [data, value]);

  return (
    <div>
      <Group gap="xs" align="flex-end">
        <Select
          label={label}
          value={value}
          onChange={(val) => onChange(val ?? '')}
          data={selectData}
          placeholder={data?.models ? 'Select a model' : 'Click refresh to load models'}
          error={error}
          searchable
          style={{ flex: 1 }}
          disabled={isFetching}
        />
        <ActionIcon
          variant="light"
          size="lg"
          onClick={() => void refetch()}
          loading={isFetching}
          aria-label={`Refresh ${label} list`}
          mb={error ? 22 : 0}
        >
          <IconRefresh size={16} />
        </ActionIcon>
      </Group>
      {isError && fetchError && (
        <Text size="xs" c="red" mt={4}>
          Failed to load models: {fetchError instanceof Error ? fetchError.message : 'Unknown error'}
        </Text>
      )}
      {data?.warning && (
        <Text size="xs" c="dimmed" mt={4}>
          {data.warning}
        </Text>
      )}
    </div>
  );
}
