import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { statusApi } from '@/api/status';
import { queryKeys } from '@/api/queryKeys';
import { createQueryWrapper, createTestQueryClient, getQueryRefetchInterval } from '@/test/queryClient';
import type { SystemStatusResponse } from '@/api/status';
import { useSystemStatus } from './useSystemStatus';

vi.mock('@/api/status', () => ({
  statusApi: {
    getStatus: vi.fn(),
  },
}));

const PROJECT_ID = '33333333-3333-4333-8333-333333333333';
const originalHiddenDescriptor = Object.getOwnPropertyDescriptor(document, 'hidden');

function makeStatus(status: SystemStatusResponse['status']): SystemStatusResponse {
  return {
    status,
    provider: {
      configured: true,
      connected: true,
      last_error: null,
    },
    health: {
      database: true,
      vector_store: true,
    },
    project: {
      index_status: status === 'indexing' ? 'indexing' : 'indexed',
      documents_total: 1,
      documents_stale: status === 'stale' ? 1 : 0,
      last_indexed: '2026-03-29T00:00:00Z',
      active_job: status === 'indexing'
        ? { status: 'running', progress_current: 0, progress_total: 1 }
        : null,
    },
  };
}

describe('useSystemStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      get: () => false,
    });
  });

  afterEach(() => {
    if (originalHiddenDescriptor) {
      Object.defineProperty(document, 'hidden', originalHiddenDescriptor);
    }
  });

  it('uses fast polling while indexing, slower polling when ready, and stops when hidden', async () => {
    vi.mocked(statusApi.getStatus).mockResolvedValue(makeStatus('indexing'));
    const queryClient = createTestQueryClient();
    const wrapper = createQueryWrapper(queryClient);

    renderHook(() => useSystemStatus(PROJECT_ID), { wrapper });

    await waitFor(() => {
      expect(statusApi.getStatus).toHaveBeenCalledWith(PROJECT_ID);
    });

    expect(getQueryRefetchInterval(queryClient, queryKeys.systemStatus(PROJECT_ID))).toBe(2000);

    act(() => {
      queryClient.setQueryData(queryKeys.systemStatus(PROJECT_ID), makeStatus('ready'));
    });

    expect(getQueryRefetchInterval(queryClient, queryKeys.systemStatus(PROJECT_ID))).toBe(5000);

    Object.defineProperty(document, 'hidden', {
      configurable: true,
      get: () => true,
    });

    expect(getQueryRefetchInterval(queryClient, queryKeys.systemStatus(PROJECT_ID))).toBe(false);
  });
});
