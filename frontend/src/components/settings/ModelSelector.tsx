import { useMemo, useState } from 'react';
import { Check, ChevronsUpDown, RefreshCw, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import type { ModelListResponse } from '@/types';

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
  const [open, setOpen] = useState(false);

  const models = useMemo(() => {
    if (!modelsData?.models || modelsData.models.length === 0) return [];
    return modelsData.models.map((m) => m.id);
  }, [modelsData]);

  const hasModels = models.length > 0;

  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <div className="flex items-center gap-2">
        {hasModels ? (
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                aria-expanded={open}
                className={cn(
                  'w-full justify-between font-normal',
                  !value && 'text-muted-foreground',
                  error && 'border-destructive'
                )}
                disabled={isFetching}
              >
                <span className="truncate">
                  {value || 'Select a model...'}
                </span>
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
              <Command>
                <CommandInput placeholder="Search models..." />
                <CommandList>
                  <CommandEmpty>No matching models.</CommandEmpty>
                  <CommandGroup>
                    {models.map((model) => (
                      <CommandItem
                        key={model}
                        value={model}
                        onSelect={(selected) => {
                          onChange(selected);
                          setOpen(false);
                        }}
                      >
                        <Check
                          className={cn(
                            'mr-2 h-4 w-4',
                            value === model ? 'opacity-100' : 'opacity-0'
                          )}
                        />
                        <span className="truncate">{model}</span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        ) : (
          <Input
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="Type a model name or click refresh"
            disabled={isFetching}
            className={cn(error && 'border-destructive')}
          />
        )}
        <Button
          variant="outline"
          size="icon"
          onClick={() => {
            onRefresh();
            setOpen(true);
          }}
          disabled={isFetching}
          aria-label={`Refresh ${label} list`}
          className="shrink-0"
        >
          {isFetching ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
        </Button>
      </div>
      {error && (
        <p className="text-xs text-destructive">{error}</p>
      )}
    </div>
  );
}
