import { Accordion, NumberInput, Switch, Stack, Paper, Text } from '@mantine/core';
import type { UseFormReturnType } from '@mantine/form';
import type { SettingsResponse } from '../../types';

interface AdvancedSettingsSectionProps {
  form: UseFormReturnType<Omit<SettingsResponse, 'id' | 'provider_capabilities' | 'updated_at'>>;
}

export function AdvancedSettingsSection({ form }: AdvancedSettingsSectionProps) {
  return (
    <Paper withBorder radius="xl" p="lg" className="surface-card">
      <Stack gap="md">
        <div>
          <Text fw={700}>Retrieval Controls</Text>
          <Text size="sm" c="dimmed">
            Adjust chunking and ranking only when you need to trade response quality against speed or recall.
          </Text>
        </div>

        <Accordion variant="separated" radius="lg">
          <Accordion.Item value="advanced">
            <Accordion.Control>Advanced Settings</Accordion.Control>
            <Accordion.Panel>
              <Stack gap="md">
                <NumberInput
                  label="Chunk Size"
                  description="Characters per chunk"
                  min={100}
                  max={32000}
                  {...form.getInputProps('chunk_size')}
                />

                <NumberInput
                  label="Chunk Overlap"
                  description="Overlap between chunks"
                  min={0}
                  max={16000}
                  {...form.getInputProps('chunk_overlap')}
                />

                <NumberInput
                  label="Top K Results"
                  description="Number of chunks to retrieve"
                  min={1}
                  max={50}
                  {...form.getInputProps('top_k')}
                />

                <NumberInput
                  label="Similarity Threshold"
                  description="Minimum relevance score (0-1)"
                  min={0}
                  max={1}
                  step={0.05}
                  decimalScale={2}
                  {...form.getInputProps('similarity_threshold')}
                />

                <Switch
                  label="Enable Reranker"
                  description="Cross-encoder reranking for improved accuracy"
                  {...form.getInputProps('reranker_enabled', { type: 'checkbox' })}
                />
              </Stack>
            </Accordion.Panel>
          </Accordion.Item>
        </Accordion>
      </Stack>
    </Paper>
  );
}
