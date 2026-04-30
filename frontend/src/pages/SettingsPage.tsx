import { useState, useEffect } from 'react';
import { Save, Loader2, AlertCircle, CheckCircle2, XCircle } from 'lucide-react';
import { useSettings, useUpdateSettings, useResetSettings } from '@/hooks/useSettings';
import { Button } from '@/components/ui/button';
import { BasicSettingsSection } from '@/components/settings/BasicSettingsSection';
import { SpeechSettingsSection } from '@/components/settings/SpeechSettingsSection';
import { AdvancedSettingsSection } from '@/components/settings/AdvancedSettingsSection';
import type { SettingsResponse, SettingsUpdate } from '@/types';

type LocalSettings = {
  provider_url: string;
  provider_api_key: string;
  provider_model: string;
  embedding_model: string;
  temperature: number;
  system_prompt: string;
  reasoning_effort: string;
  chunk_size: number;
  chunk_overlap: number;
  top_k: number;
  similarity_threshold: number;
  reranker_enabled: boolean;
  tts_provider: string;
  tts_voice_id: string;
  active_provider_id: string | null;
};

const defaultLocal: LocalSettings = {
  provider_url: '',
  provider_api_key: '',
  provider_model: '',
  embedding_model: '',
  temperature: 0.7,
  system_prompt: '',
  reasoning_effort: 'none',
  chunk_size: 2200,
  chunk_overlap: 250,
  top_k: 5,
  similarity_threshold: 0.3,
  reranker_enabled: true,
  tts_provider: '',
  tts_voice_id: '',
  active_provider_id: null,
};

function settingsToLocal(s: SettingsResponse): LocalSettings {
  return {
    provider_url: s.provider_url,
    provider_api_key: s.provider_api_key,
    provider_model: s.provider_model,
    embedding_model: s.embedding_model,
    temperature: s.temperature,
    system_prompt: s.system_prompt,
    reasoning_effort: s.reasoning_effort,
    chunk_size: s.chunk_size,
    chunk_overlap: s.chunk_overlap,
    top_k: s.top_k,
    similarity_threshold: s.similarity_threshold,
    reranker_enabled: s.reranker_enabled,
    tts_provider: s.tts_provider,
    tts_voice_id: s.tts_voice_id,
    active_provider_id: s.active_provider_id,
  };
}

export default function SettingsPage() {
  const { data: settings, isLoading, isError } = useSettings();
  const updateMutation = useUpdateSettings();
  const resetMutation = useResetSettings();

  const [localConfig, setLocalConfig] = useState<LocalSettings>(defaultLocal);
  const [initialized, setInitialized] = useState(false);

  // Sync local state when data loads
  useEffect(() => {
    if (settings && !initialized) {
      setLocalConfig(settingsToLocal(settings));
      setInitialized(true);
    }
  }, [settings, initialized]);

  const update = (key: string, value: unknown) => {
    setLocalConfig((prev) => ({ ...prev, [key]: value }));
  };

  const handleSettingsUpdated = (updated: SettingsResponse) => {
    setLocalConfig(settingsToLocal(updated));
  };

  const handleSave = () => {
    const payload: SettingsUpdate = { ...localConfig };
    // Don't send API key if it's the masked value from server
    if (payload.provider_api_key && payload.provider_api_key.includes('...')) {
      delete payload.provider_api_key;
    }
    updateMutation.mutate(payload, {
      onSuccess: (updated) => {
        setLocalConfig(settingsToLocal(updated));
      },
    });
  };

  const handleReset = () => {
    resetMutation.mutate(undefined, {
      onSuccess: (updated) => {
        setLocalConfig(settingsToLocal(updated));
      },
    });
  };

  if (isLoading) {
    return (
      <div className="p-6 lg:p-10 max-w-4xl mx-auto">
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 bg-muted rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="p-6 lg:p-10 max-w-4xl mx-auto">
        <div className="text-center py-12">
          <AlertCircle className="w-12 h-12 text-destructive/40 mx-auto mb-3" />
          <h3 className="font-medium text-foreground mb-1">Failed to load settings</h3>
          <p className="text-sm text-muted-foreground">
            Check your connection to the backend server.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-10 max-w-4xl mx-auto animate-fade-in">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Settings</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Configure your provider, model, and retrieval settings
          </p>
        </div>
        <Button onClick={handleSave} disabled={updateMutation.isPending}>
          {updateMutation.isPending ? (
            <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
          ) : (
            <Save className="w-4 h-4 mr-1.5" />
          )}
          Save
        </Button>
      </div>

      {/* Save success/error feedback */}
      {updateMutation.isSuccess && (
        <div className="bg-success/10 border border-success/20 rounded-lg p-3 mb-6 flex items-center gap-2 text-sm text-success">
          <CheckCircle2 className="w-4 h-4" /> Settings saved successfully.
        </div>
      )}
      {updateMutation.isError && (
        <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3 mb-6 flex items-center gap-2 text-sm text-destructive">
          <XCircle className="w-4 h-4" /> Failed to save settings. Please try again.
        </div>
      )}

      <div className="space-y-6">
        <BasicSettingsSection localConfig={localConfig} update={update} onSettingsUpdated={handleSettingsUpdated} />

        <SpeechSettingsSection localConfig={localConfig} update={update} />

        <AdvancedSettingsSection
          localConfig={localConfig}
          update={update}
          onReset={handleReset}
          isResetting={resetMutation.isPending}
        />
      </div>
    </div>
  );
}
