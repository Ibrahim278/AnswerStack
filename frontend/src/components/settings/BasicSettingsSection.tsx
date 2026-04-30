import { useState } from 'react';
import { Eye, EyeOff, TestTube, Loader2 } from 'lucide-react';
import { useChatModels, useEmbeddingModels, useTestConnection } from '@/hooks/useProvider';
import { ModelSelector } from './ModelSelector';
import { ProviderSelector } from './ProviderSelector';
import { TestConnectionResult } from './TestConnectionResult';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { ConnectionTestResult, SettingsResponse } from '@/types';

interface BasicSettingsSectionProps {
  localConfig: {
    provider_url: string;
    provider_api_key: string;
    provider_model: string;
    embedding_model: string;
    temperature: number;
    system_prompt: string;
    reasoning_effort: string;
    active_provider_id: string | null;
  };
  update: (key: string, value: unknown) => void;
  onSettingsUpdated: (settings: SettingsResponse) => void;
}

export function BasicSettingsSection({ localConfig, update, onSettingsUpdated }: BasicSettingsSectionProps) {
  const chatModels = useChatModels(false);
  const embeddingModels = useEmbeddingModels(false);
  const testMutation = useTestConnection();
  const [showApiKey, setShowApiKey] = useState(false);

  const handleRefreshChatModels = () => {
    void chatModels.refetch();
  };

  const handleRefreshEmbeddingModels = () => {
    void embeddingModels.refetch();
  };

  const handleTest = () => {
    testMutation.mutate();
  };

  const testResult = testMutation.data as ConnectionTestResult | undefined;

  return (
    <div className="space-y-6">
      {/* Provider section */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Provider</CardTitle>
          <CardDescription>
            Connect an OpenAI-compatible endpoint and choose your models.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ProviderSelector
            activeProviderId={localConfig.active_provider_id}
            localConfig={localConfig}
            onSettingsUpdated={onSettingsUpdated}
          />

          <div>
            <Label className="text-xs">Provider URL</Label>
            <Input
              value={localConfig.provider_url}
              onChange={(e) => update('provider_url', e.target.value)}
              className="mt-1"
              placeholder="http://localhost:1234/v1"
              autoComplete="off"
            />
          </div>

          <div>
            <Label className="text-xs">API Key</Label>
            <div className="relative mt-1">
              <Input
                type="text"
                value={localConfig.provider_api_key}
                onChange={(e) => update('provider_api_key', e.target.value)}
                placeholder="sk-... or 'not-needed' for local providers"
                className="pr-10"
                style={showApiKey ? undefined : { WebkitTextSecurity: 'disc' } as React.CSSProperties}
                autoComplete="off"
              />
              <button
                type="button"
                onClick={() => setShowApiKey(!showApiKey)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                aria-label={showApiKey ? 'Hide API key' : 'Show API key'}
              >
                {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <ModelSelector
            label="Chat Model"
            value={localConfig.provider_model}
            onChange={(value) => update('provider_model', value)}
            modelsData={chatModels.data}
            isFetching={chatModels.isFetching}
            onRefresh={handleRefreshChatModels}
          />

          <ModelSelector
            label="Embedding Model"
            value={localConfig.embedding_model}
            onChange={(value) => update('embedding_model', value)}
            modelsData={embeddingModels.data}
            isFetching={embeddingModels.isFetching}
            onRefresh={handleRefreshEmbeddingModels}
          />

          {(chatModels.isError || embeddingModels.isError) && (
            <p className="text-xs text-orange-500">
              Model listing is unavailable right now. Keep the saved model IDs or try refresh again.
              {chatModels.error instanceof Error ? ` ${chatModels.error.message}` : ''}
            </p>
          )}
          {!chatModels.data && !chatModels.isFetching && !chatModels.isError && (
            <p className="text-xs text-muted-foreground">
              Use the refresh icons to load the provider&apos;s available model list.
            </p>
          )}

          <div className="flex items-center gap-3 pt-2">
            <Button variant="outline" size="sm" onClick={handleTest} disabled={testMutation.isPending}>
              {testMutation.isPending ? (
                <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
              ) : (
                <TestTube className="w-3.5 h-3.5 mr-1" />
              )}
              Test Connection
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Test results */}
      <TestConnectionResult
        result={testResult ?? null}
        isPending={testMutation.isPending}
        isError={testMutation.isError}
      />

      {/* Generation section */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Generation</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label className="text-xs">Temperature</Label>
              <span className="text-xs text-muted-foreground font-mono">{localConfig.temperature}</span>
            </div>
            <Slider
              value={[localConfig.temperature]}
              onValueChange={([v]) => update('temperature', v)}
              min={0}
              max={2}
              step={0.05}
            />
          </div>
          <div>
            <Label className="text-xs">Reasoning Effort</Label>
            <Select
              value={localConfig.reasoning_effort || 'none'}
              onValueChange={(v) => update('reasoning_effort', v)}
            >
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None (disabled)</SelectItem>
                <SelectItem value="minimal">Minimal</SelectItem>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="xhigh">Extra High</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-1">
              Controls extended thinking for reasoning models. &quot;None&quot; is recommended for RAG.
            </p>
          </div>
          <div>
            <Label className="text-xs">System Prompt</Label>
            <Textarea
              value={localConfig.system_prompt}
              onChange={(e) => update('system_prompt', e.target.value)}
              className="mt-1 font-mono text-xs"
              rows={4}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
