import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { indexingApi } from '@/api/indexing';
import { queryKeys } from '@/api/queryKeys';
import type { IndexingStatusResponse, IndexingJobResponse } from '@/types';

const ACTIVE_JOB_STATUSES = ['running', 'pending'];

function invalidateProjectMetadata(queryClient: ReturnType<typeof useQueryClient>, projectId: string) {
  void queryClient.invalidateQueries({
    queryKey: queryKeys.projects.all,
    exact: true,
  });
  void queryClient.invalidateQueries({
    queryKey: queryKeys.projects.detail(projectId),
    exact: true,
  });
}

function invalidateSystemStatus(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({
    queryKey: ['system-status'],
  });
}

function invalidateProjectViews(queryClient: ReturnType<typeof useQueryClient>, projectId: string) {
  void queryClient.invalidateQueries({ queryKey: queryKeys.documents(projectId) });
  invalidateProjectMetadata(queryClient, projectId);
  invalidateSystemStatus(queryClient);
}

function isIndexingActive(status: IndexingStatusResponse | undefined) {
  if (!status) return false;
  const jobIsActive = !!status.job && ACTIVE_JOB_STATUSES.includes(status.job.status);
  return status.index_status === 'indexing' || jobIsActive;
}

export function useIndexingStatus(projectId: string) {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: queryKeys.indexing(projectId),
    queryFn: async ({ signal }) => {
      const prev = queryClient.getQueryData<IndexingStatusResponse>(queryKeys.indexing(projectId));
      const data = await indexingApi.getStatus(projectId, signal);

      // Refresh related views whenever indexing transitions into or out of an active state.
      if (prev && isIndexingActive(prev) !== isIndexingActive(data)) {
        invalidateProjectViews(queryClient, projectId);
      }

      return data;
    },
    enabled: !!projectId,
    refetchInterval: (query) => {
      const data = query.state.data as IndexingStatusResponse | undefined;
      if (!data) return false;
      const jobIsActive = !!data.job && ACTIVE_JOB_STATUSES.includes(data.job.status);
      return data.index_status === 'indexing' || jobIsActive ? 2000 : false;
    },
  });
}

export function useBuildIndex() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (projectId: string) => indexingApi.build(projectId),
    onSuccess: (_data, projectId) => {
      // Set indexing state — do NOT invalidate indexing query here because
      // the backend starts the job async and invalidate would refetch the
      // old completed state, overwriting this. Polling will pick up the new job.
      queryClient.setQueryData<IndexingStatusResponse>(
        queryKeys.indexing(projectId),
        (old) => old ? { ...old, index_status: 'indexing', job: null } : old,
      );
      invalidateProjectViews(queryClient, projectId);
    },
  });
}

export function useCancelIndex() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (projectId: string) => indexingApi.cancel(projectId),
    onSuccess: (cancelledJob: IndexingJobResponse, projectId) => {
      queryClient.setQueryData<IndexingStatusResponse>(
        queryKeys.indexing(projectId),
        (old) => old ? {
          ...old,
          index_status: 'stale',
          job: cancelledJob,
        } : old,
      );
      invalidateProjectViews(queryClient, projectId);
    },
  });
}

export function useRetryIndex() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (projectId: string) => indexingApi.retry(projectId),
    onSuccess: (_data, projectId) => {
      queryClient.setQueryData<IndexingStatusResponse>(
        queryKeys.indexing(projectId),
        (old) => old ? { ...old, index_status: 'indexing', job: null } : old,
      );
      invalidateProjectViews(queryClient, projectId);
    },
  });
}
