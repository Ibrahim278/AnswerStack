import { useMemo } from 'react';
import { Combobox, Group, ActionIcon, TextInput, useCombobox, ScrollArea } from '@mantine/core';
import { IconRefresh, IconChevronDown } from '@tabler/icons-react';
import type { ModelListResponse } from '../../types';

interface ModelSelectorProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  modelsData?: ModelListResponse;
  isFetching?: boolean;
  error?: string;
  onRefresh: () => void;
}

export function ModelSelector({
  label,
  value,
  onChange,
  modelsData,
  isFetching = false,
  error,
  onRefresh,
}: ModelSelectorProps) {
  const combobox = useCombobox({
    onDropdownClose: () => combobox.resetSelectedOption(),
  });

  const models = useMemo(() => {
    if (!modelsData?.models || modelsData.models.length === 0) return [];
    return modelsData.models.map((m) => m.id);
  }, [modelsData]);

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
          onClick={onRefresh}
          loading={isFetching}
          aria-label={`Refresh ${label} list`}
          mb={error ? 22 : 0}
        >
          <IconRefresh size={16} />
        </ActionIcon>
      </Group>
    </div>
  );
}
