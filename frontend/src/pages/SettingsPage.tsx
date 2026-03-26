import { useEffect, useCallback } from 'react';
import { Title, Stack, Group, Button, Skeleton } from '@mantine/core';
import { useForm } from '@mantine/form';
import { useDisclosure } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { IconDeviceFloppy, IconRestore } from '@tabler/icons-react';
import { useSettings, useUpdateSettings, useResetSettings } from '../hooks/useSettings';
import { BasicSettingsSection } from '../components/settings/BasicSettingsSection';
import { AdvancedSettingsSection } from '../components/settings/AdvancedSettingsSection';
import { ConfirmModal } from '../components/common/ConfirmModal';
import type { SettingsResponse } from '../types';

type SettingsFormValues = Omit<SettingsResponse, 'id' | 'provider_capabilities' | 'updated_at'>;

const initialFormValues: SettingsFormValues = {
  provider_url: '',
  provider_api_key: '',
  provider_model: '',
  embedding_model: '',
  temperature: 0.7,
  system_prompt: '',
  chunk_size: 1000,
  chunk_overlap: 200,
  top_k: 5,
  similarity_threshold: 0.7,
  reranker_enabled: false,
};

function isValidUrl(value: string): boolean {
  if (!value) return true; // empty is allowed
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function SettingsPageSkeleton() {
  return (
    <Stack gap="md">
      <Skeleton height={36} width={200} />
      <Skeleton height={60} />
      <Skeleton height={60} />
      <Skeleton height={60} />
      <Skeleton height={60} />
      <Skeleton height={60} />
      <Skeleton height={100} />
      <Skeleton height={50} />
    </Stack>
  );
}

export default function SettingsPage() {
  const { data: settings, isLoading } = useSettings();
  const updateSettings = useUpdateSettings();
  const resetSettings = useResetSettings();
  const [resetOpened, resetHandlers] = useDisclosure(false);

  const form = useForm<SettingsFormValues>({
    initialValues: initialFormValues,
    validateInputOnBlur: true,
    validate: {
      provider_url: (value) =>
        isValidUrl(value) ? null : 'Must be a valid URL with http or https scheme',
      temperature: (value) =>
        typeof value === 'number' && value >= 0 && value <= 2
          ? null
          : 'Temperature must be between 0.0 and 2.0',
      chunk_size: (value) =>
        typeof value === 'number' && Number.isInteger(value) && value >= 100 && value <= 32000
          ? null
          : 'Chunk size must be an integer between 100 and 32,000',
      chunk_overlap: (value, values) => {
        if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 16000) {
          return 'Chunk overlap must be an integer between 0 and 16,000';
        }
        if (typeof values.chunk_size === 'number' && value >= values.chunk_size) {
          return 'Chunk overlap must be less than chunk size';
        }
        return null;
      },
      top_k: (value) =>
        typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 50
          ? null
          : 'Top K must be an integer between 1 and 50',
      similarity_threshold: (value) =>
        typeof value === 'number' && value >= 0 && value <= 1
          ? null
          : 'Similarity threshold must be between 0.0 and 1.0',
    },
  });

  // Populate form when settings data loads
  useEffect(() => {
    if (settings) {
      form.setValues({
        provider_url: settings.provider_url,
        provider_api_key: settings.provider_api_key,
        provider_model: settings.provider_model,
        embedding_model: settings.embedding_model,
        temperature: settings.temperature,
        system_prompt: settings.system_prompt,
        chunk_size: settings.chunk_size,
        chunk_overlap: settings.chunk_overlap,
        top_k: settings.top_k,
        similarity_threshold: settings.similarity_threshold,
        reranker_enabled: settings.reranker_enabled,
      });
      form.resetDirty({
        provider_url: settings.provider_url,
        provider_api_key: settings.provider_api_key,
        provider_model: settings.provider_model,
        embedding_model: settings.embedding_model,
        temperature: settings.temperature,
        system_prompt: settings.system_prompt,
        chunk_size: settings.chunk_size,
        chunk_overlap: settings.chunk_overlap,
        top_k: settings.top_k,
        similarity_threshold: settings.similarity_threshold,
        reranker_enabled: settings.reranker_enabled,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings]);

  const handleSave = useCallback(() => {
    const validation = form.validate();
    if (validation.hasErrors) return;

    updateSettings.mutate(form.values, {
      onSuccess: () => {
        notifications.show({
          title: 'Settings saved',
          message: 'Your settings have been updated successfully.',
          color: 'green',
        });
      },
      onError: (error) => {
        console.error('Failed to save settings:', error);
        notifications.show({
          title: 'Failed to save',
          message: 'Could not save settings. Please try again.',
          color: 'red',
        });
      },
    });
  }, [form, updateSettings]);

  const handleReset = useCallback(() => {
    resetSettings.mutate(undefined, {
      onSuccess: () => {
        resetHandlers.close();
        notifications.show({
          title: 'Settings reset',
          message: 'All settings have been restored to defaults.',
          color: 'blue',
        });
      },
      onError: (error) => {
        console.error('Failed to reset settings:', error);
        notifications.show({
          title: 'Failed to reset',
          message: 'Could not reset settings. Please try again.',
          color: 'red',
        });
      },
    });
  }, [resetSettings, resetHandlers]);

  if (isLoading) {
    return (
      <Stack gap="lg">
        <Title order={1}>Settings</Title>
        <SettingsPageSkeleton />
      </Stack>
    );
  }

  return (
    <Stack gap="lg">
      <Title order={1}>Settings</Title>

      <BasicSettingsSection form={form} />

      <AdvancedSettingsSection form={form} />

      <Group justify="space-between">
        <Button
          variant="subtle"
          color="red"
          leftSection={<IconRestore size={16} />}
          onClick={resetHandlers.open}
        >
          Reset to Defaults
        </Button>
        <Button
          leftSection={<IconDeviceFloppy size={16} />}
          loading={updateSettings.isPending}
          disabled={!form.isDirty()}
          onClick={handleSave}
        >
          Save Settings
        </Button>
      </Group>

      <ConfirmModal
        opened={resetOpened}
        onClose={resetHandlers.close}
        onConfirm={handleReset}
        title="Reset to Defaults?"
        message="This will reset all settings to their default values. Your provider configuration will be cleared."
        confirmLabel="Reset Settings"
        loading={resetSettings.isPending}
        icon={<IconRestore size={20} />}
      />
    </Stack>
  );
}
