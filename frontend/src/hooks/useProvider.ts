import { useQuery, useMutation } from '@tanstack/react-query';
import { providerApi } from '@/api/provider';
import { queryKeys } from '@/api/queryKeys';

export function useChatModels(enabled = false) {
  return useQuery({
    queryKey: queryKeys.provider.chatModels,
    queryFn: () => providerApi.listModels('chat'),
    staleTime: 5 * 60 * 1000,
    enabled,
  });
}

export function useEmbeddingModels(enabled = false) {
  return useQuery({
    queryKey: queryKeys.provider.embeddingModels,
    queryFn: () => providerApi.listModels('embedding'),
    staleTime: 5 * 60 * 1000,
    enabled,
  });
}

export function useTestConnection() {
  return useMutation({
    mutationFn: () => providerApi.testConnection(),
  });
}
