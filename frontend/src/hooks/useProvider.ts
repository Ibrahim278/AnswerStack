import { useQuery, useMutation } from '@tanstack/react-query';
import { providerApi } from '../api/provider';
import { queryKeys } from '../api/queryKeys';

export function useProviderModels() {
  return useQuery({
    queryKey: queryKeys.provider.models,
    queryFn: () => providerApi.listModels(),
    enabled: false, // Only fetch when explicitly called via refetch
  });
}

export function useTestConnection() {
  return useMutation({
    mutationFn: () => providerApi.testConnection(),
  });
}
