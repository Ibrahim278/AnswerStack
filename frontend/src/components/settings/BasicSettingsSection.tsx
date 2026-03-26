import { Stack, TextInput, PasswordInput, NumberInput, Textarea } from '@mantine/core';
import type { UseFormReturnType } from '@mantine/form';
import { ModelSelector } from './ModelSelector';
import { TestConnectionResult } from './TestConnectionResult';
import type { SettingsResponse } from '../../types';

interface BasicSettingsSectionProps {
  form: UseFormReturnType<Omit<SettingsResponse, 'id' | 'provider_capabilities' | 'updated_at'>>;
}

export function BasicSettingsSection({ form }: BasicSettingsSectionProps) {
  return (
    <Stack gap="md">
      <TextInput
        label="Provider URL"
        placeholder="http://localhost:1234/v1"
        description="Base URL for your OpenAI-compatible provider"
        {...form.getInputProps('provider_url')}
      />

      <PasswordInput
        label="API Key"
        placeholder="sk-..."
        description="Enter 'not-needed' for local providers (Ollama, LM Studio)"
        {...form.getInputProps('provider_api_key')}
      />

      <ModelSelector
        label="Chat Model"
        value={form.values.provider_model}
        onChange={(value) => form.setFieldValue('provider_model', value)}
        error={form.errors.provider_model as string | undefined}
      />

      <ModelSelector
        label="Embedding Model"
        value={form.values.embedding_model}
        onChange={(value) => form.setFieldValue('embedding_model', value)}
        error={form.errors.embedding_model as string | undefined}
      />

      <NumberInput
        label="Temperature"
        description="Controls randomness (0 = deterministic, 2 = creative)"
        min={0}
        max={2}
        step={0.1}
        decimalScale={1}
        {...form.getInputProps('temperature')}
      />

      <Textarea
        label="System Prompt"
        placeholder="You are a helpful assistant..."
        autosize
        minRows={3}
        maxRows={8}
        {...form.getInputProps('system_prompt')}
      />

      <TestConnectionResult />
    </Stack>
  );
}
