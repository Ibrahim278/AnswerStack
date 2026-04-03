import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { indexingApi } from '@/api/indexing';
import { queryKeys } from '@/api/queryKeys';
import { createQueryWrapper, createTestQueryClient, getQueryRefetchInterval } from '@/test/queryClient';
import type { IndexingJobResponse, IndexingStatusResponse, IndexingTriggerResponse } from '@/types';
import {
  useBuildIndex,
  useCancelIndex,
  useIndexingStatus,
  useRetryIndex,
} from './useIndexing';

vi.mock('@/api/indexing', () => ({
  indexingApi: {
    getStatus: vi.fn(),
    build: vi.fn(),
    cancel: vi.fn(),
    retry: vi.fn(),
  },
}));

const PROJECT_ID = '22222222-2222-4222-8222-222222222222';

function makeJob(status: string): IndexingJobResponse {
  return {
    id: 'job-1',
    project_id: PROJECT_ID,
    status,
    documents_processed: status === 'completed' ? 1 : 0,
    documents_total: 1,
    percentage: status === 'completed' ? 100 : 0,
    current_document_id: status === 'running' ? 'doc-1' : null,
    error_detail: null,
    created_at: '2026-03-29T00:00:00Z',
    started_at: '2026-03-29T00:00:00Z',
    completed_at: status === 'completed' || status === 'cancelled'
      ? '2026-03-29T00:01:00Z'
      : null,
  };
}

function makeStatus(
  indexStatus: string,
  job: IndexingJobResponse | null,
  lastIndexedAt: string | null = null,
): IndexingStatusResponse {
  return {
    index_status: indexStatus,
    job,
    last_indexed_at: lastIndexedAt,
  };
}

function makeTrigger(status: string): IndexingTriggerResponse {
  return {
    id: 'job-1',
    project_id: PROJECT_ID,
    status,
    created_at: '2026-03-29T00:00:00Z',
  };
}

describe('useIndexing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('polls while indexing is active and stops when indexing settles', async () => {
    vi.mocked(indexingApi.getStatus).mockResolvedValue(makeStatus('indexing', makeJob('running')));
    const queryClient = createTestQueryClient();
    const wrapper = createQueryWrapper(queryClient);

    renderHook(() => useIndexingStatus(PROJECT_ID), { wrapper });

    await waitFor(() => {
      expect(indexingApi.getStatus).toHaveBeenCalled();
    });

    expect(getQueryRefetchInterval(queryClient, queryKeys.indexing(PROJECT_ID))).toBe(2000);

    act(() => {
      queryClient.setQueryData(
        queryKeys.indexing(PROJECT_ID),
        makeStatus('indexed', makeJob('completed'), '2026-03-29T00:01:00Z'),
      );
    });

    expect(getQueryRefetchInterval(queryClient, queryKeys.indexing(PROJECT_ID))).toBe(false);
  });

  it('refreshes related queries when indexing starts', async () => {
    vi.mocked(indexingApi.getStatus).mockResolvedValue(makeStatus('indexing', makeJob('running')));
    const queryClient = createTestQueryClient();
    const wrapper = createQueryWrapper(queryClient);
    const invalidateSpy = vi
      .spyOn(queryClient, 'invalidateQueries')
      .mockImplementation(async () => undefined);

    act(() => {
      queryClient.setQueryData(queryKeys.indexing(PROJECT_ID), makeStatus('stale', null));
    });

    renderHook(() => useIndexingStatus(PROJECT_ID), { wrapper });

    await waitFor(() => {
      expect(indexingApi.getStatus).toHaveBeenCalled();
    });

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.documents(PROJECT_ID) });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.projects.all, exact: true });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.projects.detail(PROJECT_ID), exact: true });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['system-status'] });
  });

  it('refreshes related queries when indexing completes', async () => {
    vi.mocked(indexingApi.getStatus).mockResolvedValue(
      makeStatus('indexed', makeJob('completed'), '2026-03-29T00:01:00Z'),
    );
    const queryClient = createTestQueryClient();
    const wrapper = createQueryWrapper(queryClient);
    const invalidateSpy = vi
      .spyOn(queryClient, 'invalidateQueries')
      .mockImplementation(async () => undefined);

    act(() => {
      queryClient.setQueryData(queryKeys.indexing(PROJECT_ID), makeStatus('indexing', makeJob('running')));
    });

    renderHook(() => useIndexingStatus(PROJECT_ID), { wrapper });

    await waitFor(() => {
      expect(indexingApi.getStatus).toHaveBeenCalled();
    });

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.documents(PROJECT_ID) });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.projects.all, exact: true });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.projects.detail(PROJECT_ID), exact: true });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['system-status'] });
  });

  it('optimistically marks build start and refreshes related queries', async () => {
    vi.mocked(indexingApi.build).mockResolvedValue(makeTrigger('pending'));
    const queryClient = createTestQueryClient();
    const wrapper = createQueryWrapper(queryClient);
    const invalidateSpy = vi
      .spyOn(queryClient, 'invalidateQueries')
      .mockImplementation(async () => undefined);

    act(() => {
      queryClient.setQueryData(queryKeys.indexing(PROJECT_ID), makeStatus('stale', null));
    });

    const { result } = renderHook(() => useBuildIndex(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync(PROJECT_ID);
    });

    expect(queryClient.getQueryData<IndexingStatusResponse>(queryKeys.indexing(PROJECT_ID))).toEqual(
      makeStatus('indexing', null),
    );
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.documents(PROJECT_ID) });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.projects.all, exact: true });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.projects.detail(PROJECT_ID), exact: true });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['system-status'] });
  });

  it('keeps first-build cancellation stale and refreshes related queries', async () => {
    vi.mocked(indexingApi.cancel).mockResolvedValue(makeJob('cancelled'));
    const queryClient = createTestQueryClient();
    const wrapper = createQueryWrapper(queryClient);
    const invalidateSpy = vi
      .spyOn(queryClient, 'invalidateQueries')
      .mockImplementation(async () => undefined);

    act(() => {
      queryClient.setQueryData(queryKeys.indexing(PROJECT_ID), makeStatus('indexing', makeJob('running')));
    });

    const { result } = renderHook(() => useCancelIndex(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync(PROJECT_ID);
    });

    expect(queryClient.getQueryData<IndexingStatusResponse>(queryKeys.indexing(PROJECT_ID))).toEqual(
      makeStatus('stale', makeJob('cancelled')),
    );
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.documents(PROJECT_ID) });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.projects.all, exact: true });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.projects.detail(PROJECT_ID), exact: true });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['system-status'] });
  });

  it('optimistically marks retry start and refreshes related queries', async () => {
    vi.mocked(indexingApi.retry).mockResolvedValue(makeTrigger('pending'));
    const queryClient = createTestQueryClient();
    const wrapper = createQueryWrapper(queryClient);
    const invalidateSpy = vi
      .spyOn(queryClient, 'invalidateQueries')
      .mockImplementation(async () => undefined);

    act(() => {
      queryClient.setQueryData(
        queryKeys.indexing(PROJECT_ID),
        makeStatus('failed', makeJob('cancelled')),
      );
    });

    const { result } = renderHook(() => useRetryIndex(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync(PROJECT_ID);
    });

    expect(queryClient.getQueryData<IndexingStatusResponse>(queryKeys.indexing(PROJECT_ID))).toEqual(
      makeStatus('indexing', null),
    );
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.documents(PROJECT_ID) });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.projects.all, exact: true });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.projects.detail(PROJECT_ID), exact: true });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['system-status'] });
  });
});
