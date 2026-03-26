import { Stack, TextInput, PasswordInput, NumberInput, Textarea, Paper, Text } from '@mantine/core';
import type { UseFormReturnType } from '@mantine/form';
import { useProviderModels } from '../../hooks/useProvider';
import { ModelSelector } from './ModelSelector';
import { TestConnectionResult } from './TestConnectionResult';
import type { SettingsResponse } from '../../types';

interface BasicSettingsSectionProps {
  form: UseFormReturnType<Omit<SettingsResponse, 'id' | 'provider_capabilities' | 'updated_at'>>;
}

export function BasicSettingsSection({ form }: BasicSettingsSectionProps) {
  const providerModels = useProviderModels(false);
  const handleRefreshModels = () => {
    void providerModels.refetch();
  };

  return (
    <Paper withBorder radius="xl" p="lg" className="surface-card">
      <Stack gap="lg">
        <Stack gap={4}>
          <Text fw={700}>Provider Setup</Text>
          <Text size="sm" c="dimmed">
            Connect an OpenAI-compatible endpoint, choose chat and embedding models, and set the baseline response behavior.
          </Text>
        </Stack>

        <TextInput
          label="Provider URL"
          placeholder="http://localhost:1234/v1"
          description="Base URL for your OpenAI-compatible provider"
          {...form.getInputProps('provider_url')}
        />

        <PasswordInput
          label="API Key"
          placeholder="sk-..."
          description="Enter 'not-needed' for local providers such as Ollama or LM Studio"
          {...form.getInputProps('provider_api_key')}
        />

        <ModelSelector
          label="Chat Model"
          value={form.values.provider_model}
          onChange={(value) => form.setFieldValue('provider_model', value)}
          modelsData={providerModels.data}
          isFetching={providerModels.isFetching}
          error={form.errors.provider_model as string | undefined}
          onRefresh={handleRefreshModels}
        />

        <ModelSelector
          label="Embedding Model"
          value={form.values.embedding_model}
          onChange={(value) => form.setFieldValue('embedding_model', value)}
          modelsData={providerModels.data}
          isFetching={providerModels.isFetching}
          error={form.errors.embedding_model as string | undefined}
          onRefresh={handleRefreshModels}
        />

        {providerModels.isError && (
          <Text size="xs" c="orange">
            Model listing is unavailable right now. Keep the saved model ids or try refresh again.
            {' '}
            {providerModels.error instanceof Error ? providerModels.error.message : 'Unknown error.'}
          </Text>
        )}
        {!providerModels.data && !providerModels.isFetching && !providerModels.isError && (
          <Text size="xs" c="dimmed">
            Use the refresh icons to load the provider&apos;s available model list when you need to switch models.
          </Text>
        )}
        {providerModels.data?.warning && (
          <Text size="xs" c="dimmed">
            {providerModels.data.warning}
          </Text>
        )}

        <NumberInput
          label="Temperature"
          description="Controls randomness from deterministic to exploratory"
          min={0}
          max={2}
          step={0.1}
          decimalScale={1}
          {...form.getInputProps('temperature')}
        />

        <Textarea
          label="System Prompt"
          placeholder="You are a helpful assistant..."
          description="Applied to every answer. Keep it short and stable."
          autosize
          minRows={3}
          maxRows={8}
          {...form.getInputProps('system_prompt')}
        />

        <TestConnectionResult />
      </Stack>
    </Paper>
  );
}
