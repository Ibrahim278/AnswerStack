import { useState } from 'react';
import { Plus, Pencil, Trash2, Loader2 } from 'lucide-react';
import {
  useProviderConfigs,
  useCreateProviderConfig,
  useUpdateProviderConfig,
  useDeleteProviderConfig,
  useActivateProviderConfig,
} from '@/hooks/useProviderConfigs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import type { SettingsResponse } from '@/types';

interface ProviderSelectorProps {
  activeProviderId: string | null;
  localConfig: {
    provider_url: string;
    provider_api_key: string;
    provider_model: string;
    embedding_model: string;
  };
  onSettingsUpdated: (settings: SettingsResponse) => void;
}

export function ProviderSelector({ activeProviderId, localConfig, onSettingsUpdated }: ProviderSelectorProps) {
  const { data: providersData } = useProviderConfigs();
  const createMutation = useCreateProviderConfig();
  const updateMutation = useUpdateProviderConfig();
  const deleteMutation = useDeleteProviderConfig();
  const activateMutation = useActivateProviderConfig();

  const [showNewDialog, setShowNewDialog] = useState(false);
  const [showRenameDialog, setShowRenameDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [dialogName, setDialogName] = useState('');

  const providers = providersData?.items ?? [];
  const activeProvider = providers.find((p) => p.id === activeProviderId);
  const isMutating = activateMutation.isPending || createMutation.isPending;

  const handleSwitch = (providerId: string) => {
    if (providerId === activeProviderId) return;
    activateMutation.mutate(providerId, {
      onSuccess: (settings) => onSettingsUpdated(settings),
    });
  };

  const handleCreate = () => {
    if (!dialogName.trim()) return;
    createMutation.mutate(
      {
        name: dialogName.trim(),
        provider_url: localConfig.provider_url,
        provider_api_key: localConfig.provider_api_key?.includes('...') ? '' : localConfig.provider_api_key,
        provider_model: localConfig.provider_model,
        embedding_model: localConfig.embedding_model,
      },
      {
        onSuccess: (created) => {
          setShowNewDialog(false);
          setDialogName('');
          // Activate the newly created provider
          activateMutation.mutate(created.id, {
            onSuccess: (settings) => onSettingsUpdated(settings),
          });
        },
      },
    );
  };

  const handleRename = () => {
    if (!activeProviderId || !dialogName.trim()) return;
    updateMutation.mutate(
      { id: activeProviderId, data: { name: dialogName.trim() } },
      {
        onSuccess: () => {
          setShowRenameDialog(false);
          setDialogName('');
        },
      },
    );
  };

  const handleDelete = () => {
    if (!activeProviderId) return;
    deleteMutation.mutate(activeProviderId, {
      onSuccess: () => setShowDeleteDialog(false),
    });
  };

  return (
    <>
      <div className="flex items-center gap-2 mb-4">
        <div className="flex-1">
          <Label className="text-xs">Saved Providers</Label>
          <Select
            value={activeProviderId ?? '__none__'}
            onValueChange={(v) => {
              if (v !== '__none__') handleSwitch(v);
            }}
            disabled={isMutating}
          >
            <SelectTrigger className="mt-1">
              {isMutating ? (
                <div className="flex items-center gap-2">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Switching...</span>
                </div>
              ) : (
                <SelectValue placeholder="No saved provider" />
              )}
            </SelectTrigger>
            <SelectContent>
              {providers.length === 0 ? (
                <SelectItem value="__none__" disabled>
                  No saved providers
                </SelectItem>
              ) : (
                <>
                  {providers.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </>
              )}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-1 mt-5">
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => {
              setDialogName('');
              setShowNewDialog(true);
            }}
            title="Save as new provider"
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
          {activeProviderId && (
            <>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => {
                  setDialogName(activeProvider?.name ?? '');
                  setShowRenameDialog(true);
                }}
                title="Rename provider"
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8 text-destructive hover:text-destructive"
                onClick={() => setShowDeleteDialog(true)}
                title="Delete provider"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </>
          )}
        </div>
      </div>

      {/* New provider dialog */}
      <Dialog open={showNewDialog} onOpenChange={setShowNewDialog}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Save Provider</DialogTitle>
            <DialogDescription>
              Save the current provider configuration with a name for easy switching.
            </DialogDescription>
          </DialogHeader>
          <div>
            <Label className="text-xs">Provider Name</Label>
            <Input
              value={dialogName}
              onChange={(e) => setDialogName(e.target.value)}
              placeholder="e.g. OpenAI, Local LLM"
              className="mt-1"
              autoFocus
              onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={!dialogName.trim() || createMutation.isPending}
            >
              {createMutation.isPending && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename dialog */}
      <Dialog open={showRenameDialog} onOpenChange={setShowRenameDialog}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Rename Provider</DialogTitle>
          </DialogHeader>
          <div>
            <Label className="text-xs">Provider Name</Label>
            <Input
              value={dialogName}
              onChange={(e) => setDialogName(e.target.value)}
              className="mt-1"
              autoFocus
              onKeyDown={(e) => { if (e.key === 'Enter') handleRename(); }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRenameDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleRename}
              disabled={!dialogName.trim() || updateMutation.isPending}
            >
              {updateMutation.isPending && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}
              Rename
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Provider</AlertDialogTitle>
            <AlertDialogDescription>
              Delete &quot;{activeProvider?.name}&quot;? The current configuration will remain active but won&apos;t be saved as a provider preset.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
