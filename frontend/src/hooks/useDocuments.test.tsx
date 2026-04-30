import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { documentsApi } from '@/api/documents';
import { queryKeys } from '@/api/queryKeys';
import { createQueryWrapper, createTestQueryClient, getQueryRefetchInterval } from '@/test/queryClient';
import type { DocumentResponse, DocumentUploadResult, PaginatedResponse } from '@/types';
import { useDeleteDocument, useDocuments, useUploadDocuments } from './useDocuments';

vi.mock('@/api/documents', () => ({
  documentsApi: {
    list: vi.fn(),
    upload: vi.fn(),
    delete: vi.fn(),
  },
}));

const PROJECT_ID = '11111111-1111-4111-8111-111111111111';

function makeDocument(status: string): DocumentResponse {
  return {
    id: 'doc-1',
    project_id: PROJECT_ID,
    filename: 'alpha.txt',
    original_filename: 'alpha.txt',
    file_type: 'text/plain',
    file_size: 128,
    checksum: 'checksum',
    status,
    chunk_count: 0,
    error_detail: null,
    created_at: '2026-03-29T00:00:00Z',
    updated_at: '2026-03-29T00:00:00Z',
  };
}

function makePage(status: string): PaginatedResponse<DocumentResponse> {
  return {
    items: [makeDocument(status)],
    next_cursor: null,
    limit: 1,
  };
}

function makeUploadResult(): DocumentUploadResult {
  return {
    uploaded: [makeDocument('uploaded')],
    rejected: [],
  };
}

describe('useDocuments', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('polls while documents are processing and stops after parse completion', async () => {
    vi.mocked(documentsApi.list).mockResolvedValue(makePage('parsing'));
    const queryClient = createTestQueryClient();
    const wrapper = createQueryWrapper(queryClient);

    renderHook(() => useDocuments(PROJECT_ID), { wrapper });

    await waitFor(() => {
      expect(documentsApi.list).toHaveBeenCalledWith(PROJECT_ID);
    });

    expect(getQueryRefetchInterval(queryClient, queryKeys.documents(PROJECT_ID))).toBe(2000);

    act(() => {
      queryClient.setQueryData(queryKeys.documents(PROJECT_ID), makePage('parsed'));
    });

    expect(getQueryRefetchInterval(queryClient, queryKeys.documents(PROJECT_ID))).toBe(false);
  });

  it('invalidates document, indexing, project, and status queries after upload', async () => {
    vi.mocked(documentsApi.upload).mockResolvedValue(makeUploadResult());
    const queryClient = createTestQueryClient();
    const wrapper = createQueryWrapper(queryClient);
    const invalidateSpy = vi
      .spyOn(queryClient, 'invalidateQueries')
      .mockImplementation(async () => undefined);

    const { result } = renderHook(() => useUploadDocuments(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        projectId: PROJECT_ID,
        files: [new File(['hello'], 'alpha.txt', { type: 'text/plain' })],
      });
    });

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.documents(PROJECT_ID) });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.indexing(PROJECT_ID) });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.projects.all, exact: true });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.projects.detail(PROJECT_ID), exact: true });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['system-status'] });
  });

  it('invalidates document, indexing, project, and status queries after delete', async () => {
    vi.mocked(documentsApi.delete).mockResolvedValue(undefined);
    const queryClient = createTestQueryClient();
    const wrapper = createQueryWrapper(queryClient);
    const invalidateSpy = vi
      .spyOn(queryClient, 'invalidateQueries')
      .mockImplementation(async () => undefined);

    const { result } = renderHook(() => useDeleteDocument(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        projectId: PROJECT_ID,
        documentId: 'doc-1',
      });
    });

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.documents(PROJECT_ID) });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.indexing(PROJECT_ID) });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.projects.all, exact: true });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.projects.detail(PROJECT_ID), exact: true });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['system-status'] });
  });
});
