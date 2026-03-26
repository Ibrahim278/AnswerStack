import { useQuery, useMutation } from '@tanstack/react-query';
import { providerApi } from '../api/provider';
import { queryKeys } from '../api/queryKeys';

export function useProviderModels() {
  return useQuery({
    queryKey: queryKeys.provider.models,
    queryFn: () => providerApi.listModels(),
    staleTime: 5 * 60 * 1000, // Cache models for 5 minutes
  });
}

export function useTestConnection() {
  return useMutation({
    mutationFn: () => providerApi.testConnection(),
  });
}
