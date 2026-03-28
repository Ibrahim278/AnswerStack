import { useState } from 'react';
import { ChevronDown, ChevronRight, RotateCcw, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent } from '@/components/ui/card';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';

interface AdvancedSettingsSectionProps {
  localConfig: {
    top_k: number;
    similarity_threshold: number;
    chunk_size: number;
    chunk_overlap: number;
    reranker_enabled: boolean;
  };
  update: (key: string, value: unknown) => void;
  onReset: () => void;
  isResetting: boolean;
}

export function AdvancedSettingsSection({
  localConfig,
  update,
  onReset,
  isResetting,
}: AdvancedSettingsSectionProps) {
  const [open, setOpen] = useState(false);

  return (
    <Card>
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <button className="flex items-center justify-between w-full p-5 text-left">
            <div>
              <h3 className="text-sm font-medium text-foreground">Advanced Settings</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Chunking, ranking, and retrieval controls
              </p>
            </div>
            {open ? (
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            )}
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <CardContent className="space-y-5 border-t border-border pt-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-xs">Top K (retrieval results)</Label>
                <span className="text-xs text-muted-foreground font-mono">{localConfig.top_k}</span>
              </div>
              <Slider
                value={[localConfig.top_k]}
                onValueChange={([v]) => update('top_k', v)}
                min={1}
                max={50}
                step={1}
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-xs">Similarity Threshold</Label>
                <span className="text-xs text-muted-foreground font-mono">
                  {localConfig.similarity_threshold}
                </span>
              </div>
              <Slider
                value={[localConfig.similarity_threshold]}
                onValueChange={([v]) => update('similarity_threshold', v)}
                min={0}
                max={1}
                step={0.05}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs">Chunk Size</Label>
                <Input
                  type="number"
                  value={localConfig.chunk_size}
                  onChange={(e) => update('chunk_size', parseInt(e.target.value) || 0)}
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-xs">Chunk Overlap</Label>
                <Input
                  type="number"
                  value={localConfig.chunk_overlap}
                  onChange={(e) => update('chunk_overlap', parseInt(e.target.value) || 0)}
                  className="mt-1"
                />
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label className="text-xs">Reranker Enabled</Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Cross-encoder reranking for improved accuracy
                </p>
              </div>
              <Switch
                checked={localConfig.reranker_enabled}
                onCheckedChange={(v) => update('reranker_enabled', v)}
              />
            </div>

            <Button variant="outline" size="sm" onClick={onReset} disabled={isResetting}>
              {isResetting ? (
                <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
              ) : (
                <RotateCcw className="w-3.5 h-3.5 mr-1" />
              )}
              Reset to Defaults
            </Button>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
