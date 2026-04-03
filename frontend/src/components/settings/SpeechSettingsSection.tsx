import { useState } from 'react';
import { Check, ChevronsUpDown, RefreshCw, Loader2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { getTTSProviders, getVoices } from '@/api/speech';
import type { VoiceItem } from '@/api/speech';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface SpeechSettingsSectionProps {
  localConfig: {
    tts_provider: string;
    tts_voice_id: string;
  };
  update: (key: string, value: unknown) => void;
}

export function SpeechSettingsSection({ localConfig, update }: SpeechSettingsSectionProps) {
  const [voicePickerOpen, setVoicePickerOpen] = useState(false);

  const providersQuery = useQuery({
    queryKey: ['speech', 'providers'],
    queryFn: getTTSProviders,
    staleTime: 60_000,
  });

  const selectedProvider = localConfig.tts_provider;
  const hasActiveProvider = selectedProvider !== '' && selectedProvider !== 'none';

  const voicesQuery = useQuery({
    queryKey: ['speech', 'voices', selectedProvider],
    queryFn: () => getVoices(selectedProvider),
    enabled: hasActiveProvider,
    staleTime: 5 * 60_000,
  });

  const providers = providersQuery.data?.providers ?? [];
  const voices: VoiceItem[] = voicesQuery.data?.voices ?? [];
  const selectedVoice = voices.find((v) => v.voice_id === localConfig.tts_voice_id);

  const handleProviderChange = (value: string) => {
    update('tts_provider', value);
    update('tts_voice_id', '');
  };

  const handleRefreshVoices = () => {
    void voicesQuery.refetch();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Speech</CardTitle>
        <CardDescription>
          Text-to-speech provider and voice selection.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Provider selector */}
        <div>
          <Label className="text-xs">TTS Provider</Label>
          <Select
            value={localConfig.tts_provider || 'none'}
            onValueChange={handleProviderChange}
            disabled={providersQuery.isLoading}
          >
            <SelectTrigger className="mt-1">
              <SelectValue placeholder={providersQuery.isLoading ? 'Loading...' : 'Select a provider'} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">
                <span className="text-muted-foreground">None (disabled)</span>
              </SelectItem>
              {providers.map((p) => (
                <SelectItem key={p.id} value={p.id} disabled={!p.available}>
                  <span className="flex items-center gap-2">
                    {p.name}
                    {!p.available && p.reason && (
                      <span className="text-[10px] text-muted-foreground">({p.reason})</span>
                    )}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {providersQuery.isError && (
            <p className="text-xs text-orange-500 mt-1">
              Could not load provider list.
            </p>
          )}
        </div>

        {/* Voice selector — only show if a provider is selected */}
        {hasActiveProvider && (
          <div className="space-y-1.5">
            <Label className="text-xs">Voice</Label>
            <div className="flex items-center gap-2">
              <Popover open={voicePickerOpen} onOpenChange={setVoicePickerOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={voicePickerOpen}
                    className={cn(
                      'w-full justify-between font-normal',
                      !localConfig.tts_voice_id && 'text-muted-foreground',
                    )}
                    disabled={voicesQuery.isLoading}
                  >
                    <span className="truncate">
                      {selectedVoice
                        ? selectedVoice.name
                        : localConfig.tts_voice_id
                          ? localConfig.tts_voice_id
                          : 'Provider default'}
                    </span>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Search voices..." />
                    <CommandList>
                      <CommandEmpty>No matching voices.</CommandEmpty>
                      <CommandGroup>
                        {/* Default option to clear selection */}
                        <CommandItem
                          value="__default__"
                          onSelect={() => {
                            update('tts_voice_id', '');
                            setVoicePickerOpen(false);
                          }}
                        >
                          <Check
                            className={cn(
                              'mr-2 h-4 w-4',
                              !localConfig.tts_voice_id ? 'opacity-100' : 'opacity-0',
                            )}
                          />
                          <span className="text-muted-foreground">Provider default</span>
                        </CommandItem>
                        {voices.map((voice) => (
                          <CommandItem
                            key={voice.voice_id}
                            value={voice.name}
                            onSelect={() => {
                              update('tts_voice_id', voice.voice_id);
                              setVoicePickerOpen(false);
                            }}
                          >
                            <Check
                              className={cn(
                                'mr-2 h-4 w-4',
                                localConfig.tts_voice_id === voice.voice_id ? 'opacity-100' : 'opacity-0',
                              )}
                            />
                            <span className="truncate">{voice.name}</span>
                            {voice.labels && Object.keys(voice.labels).length > 0 && (
                              <span className="ml-auto text-[10px] text-muted-foreground truncate max-w-[120px]">
                                {Object.values(voice.labels).slice(0, 2).join(', ')}
                              </span>
                            )}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              <Button
                variant="outline"
                size="icon"
                onClick={handleRefreshVoices}
                disabled={voicesQuery.isFetching}
                aria-label="Refresh voice list"
                className="shrink-0"
              >
                {voicesQuery.isFetching ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
              </Button>
            </div>
            {voicesQuery.isError && (
              <p className="text-xs text-orange-500">
                Could not load voice list. Try refreshing.
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
