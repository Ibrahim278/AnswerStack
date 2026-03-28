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

export function useIndexingStatus(projectId: string) {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: queryKeys.indexing(projectId),
    queryFn: async ({ signal }) => {
      const prev = queryClient.getQueryData<IndexingStatusResponse>(queryKeys.indexing(projectId));
      const data = await indexingApi.getStatus(projectId, signal);
      // When job transitions from active to completed, refresh documents
      if (
        prev?.job && ACTIVE_JOB_STATUSES.includes(prev.job.status) &&
        data?.job && !ACTIVE_JOB_STATUSES.includes(data.job.status)
      ) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.documents(projectId) });
        invalidateProjectMetadata(queryClient, projectId);
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
          index_status: old.last_indexed_at ? 'stale' : 'not_indexed',
          job: cancelledJob,
        } : old,
      );
      void queryClient.invalidateQueries({ queryKey: queryKeys.documents(projectId) });
      invalidateProjectMetadata(queryClient, projectId);
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
    },
  });
}
