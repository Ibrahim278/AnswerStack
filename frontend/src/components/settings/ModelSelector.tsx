import { Select } from '@mantine/core';

interface ModelSelectorProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
}

// Stub — fully implemented in Task 2
export function ModelSelector({ label, value, onChange, error }: ModelSelectorProps) {
  return (
    <Select
      label={label}
      value={value}
      onChange={(val) => onChange(val ?? '')}
      data={value ? [{ value, label: value }] : []}
      placeholder="Click refresh to load models"
      error={error}
      searchable
    />
  );
}
