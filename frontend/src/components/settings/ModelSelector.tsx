import { useMemo } from 'react';
import { Combobox, Group, ActionIcon, Text, TextInput, useCombobox, ScrollArea } from '@mantine/core';
import { IconRefresh, IconChevronDown } from '@tabler/icons-react';
import { useProviderModels } from '../../hooks/useProvider';

interface ModelSelectorProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
}

export function ModelSelector({ label, value, onChange, error }: ModelSelectorProps) {
  const { data, isFetching, isError, error: fetchError, refetch } = useProviderModels();
  const combobox = useCombobox({
    onDropdownClose: () => combobox.resetSelectedOption(),
  });

  const models = useMemo(() => {
    if (!data?.models || data.models.length === 0) return [];
    return data.models.map((m) => m.id);
  }, [data]);

  // Filter models based on current input
  const filtered = useMemo(() => {
    if (!value) return models;
    const lower = value.toLowerCase();
    return models.filter((m) => m.toLowerCase().includes(lower));
  }, [models, value]);

  return (
    <div>
      <Group gap="xs" align="flex-end">
        <Combobox
          store={combobox}
          onOptionSubmit={(val) => {
            onChange(val);
            combobox.closeDropdown();
          }}
        >
          <Combobox.Target>
            <TextInput
              label={label}
              value={value}
              onChange={(e) => {
                onChange(e.currentTarget.value);
                combobox.openDropdown();
                combobox.updateSelectedOptionIndex();
              }}
              onClick={() => combobox.openDropdown()}
              onFocus={() => combobox.openDropdown()}
              onBlur={() => combobox.closeDropdown()}
              placeholder="Type a model name or select from list"
              error={error}
              style={{ flex: 1 }}
              disabled={isFetching}
              rightSection={<IconChevronDown size={14} style={{ opacity: 0.5 }} />}
            />
          </Combobox.Target>
          <Combobox.Dropdown>
            <Combobox.Options>
              <ScrollArea.Autosize mah={200}>
                {filtered.length > 0 ? (
                  filtered.map((m) => (
                    <Combobox.Option key={m} value={m}>
                      {m}
                    </Combobox.Option>
                  ))
                ) : (
                  <Combobox.Empty>
                    {models.length === 0 ? 'Click refresh to load models' : 'No matching models'}
                  </Combobox.Empty>
                )}
              </ScrollArea.Autosize>
            </Combobox.Options>
          </Combobox.Dropdown>
        </Combobox>
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
