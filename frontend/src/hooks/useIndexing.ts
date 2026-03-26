import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { indexingApi } from '../api/indexing';
import { queryKeys } from '../api/queryKeys';
import type { IndexingStatusResponse } from '../types';

const ACTIVE_JOB_STATUSES = ['running', 'pending'];

export function useIndexingStatus(projectId: string) {
  return useQuery({
    queryKey: queryKeys.indexing(projectId),
    queryFn: () => indexingApi.getStatus(projectId),
    enabled: !!projectId,
    refetchInterval: (query) => {
      const data = query.state.data as IndexingStatusResponse | undefined;
      if (!data?.job) return false;
      return ACTIVE_JOB_STATUSES.includes(data.job.status) ? 2000 : false;
    },
  });
}

export function useBuildIndex() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (projectId: string) => indexingApi.build(projectId),
    onSuccess: (_data, projectId) => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.indexing(projectId),
      });
    },
  });
}

export function useCancelIndex() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (projectId: string) => indexingApi.cancel(projectId),
    onSuccess: (_data, projectId) => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.indexing(projectId),
      });
    },
  });
}

export function useRetryIndex() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (projectId: string) => indexingApi.retry(projectId),
    onSuccess: (_data, projectId) => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.indexing(projectId),
      });
    },
  });
}
