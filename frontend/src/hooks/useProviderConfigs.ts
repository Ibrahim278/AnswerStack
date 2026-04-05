import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { providerConfigsApi } from '@/api/providerConfigs';
import { queryKeys } from '@/api/queryKeys';
import type { ProviderConfigCreate, ProviderConfigUpdate } from '@/types';

export function useProviderConfigs() {
  return useQuery({
    queryKey: queryKeys.providerConfigs.all,
    queryFn: () => providerConfigsApi.list(),
  });
}

export function useCreateProviderConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: ProviderConfigCreate) => providerConfigsApi.create(data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.providerConfigs.all });
    },
  });
}

export function useUpdateProviderConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: ProviderConfigUpdate }) =>
      providerConfigsApi.update(id, data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.providerConfigs.all });
    },
  });
}

export function useDeleteProviderConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => providerConfigsApi.delete(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.providerConfigs.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.settings });
    },
  });
}

export function useActivateProviderConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => providerConfigsApi.activate(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.settings });
      void queryClient.invalidateQueries({ queryKey: queryKeys.provider.models });
      void queryClient.invalidateQueries({ queryKey: queryKeys.providerConfigs.all });
    },
  });
}
