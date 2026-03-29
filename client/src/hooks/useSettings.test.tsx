import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { settingsApi } from '@/api/settings';
import { queryKeys } from '@/api/queryKeys';
import { createQueryWrapper, createTestQueryClient } from '@/test/queryClient';
import type { SettingsResponse } from '@/types';
import { useUpdateSettings } from './useSettings';

vi.mock('@/api/settings', () => ({
  settingsApi: {
    get: vi.fn(),
    update: vi.fn(),
    reset: vi.fn(),
  },
}));

function makeSettings(): SettingsResponse {
  return {
    id: 'settings-1',
    provider_url: 'http://localhost:11434',
    provider_api_key: '',
    provider_model: 'gpt-test',
    embedding_model: 'text-embedding-test',
    temperature: 0,
    system_prompt: 'You are helpful.',
    chunk_size: 500,
    chunk_overlap: 50,
    top_k: 5,
    similarity_threshold: 0.5,
    reranker_enabled: false,
    provider_capabilities: null,
    updated_at: '2026-03-29T00:00:00Z',
  };
}

describe('useUpdateSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('invalidates project and status queries after settings changes', async () => {
    vi.mocked(settingsApi.update).mockResolvedValue(makeSettings());
    const queryClient = createTestQueryClient();
    const wrapper = createQueryWrapper(queryClient);
    const invalidateSpy = vi
      .spyOn(queryClient, 'invalidateQueries')
      .mockImplementation(async () => undefined);

    const { result } = renderHook(() => useUpdateSettings(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ chunk_size: 700 });
    });

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.settings });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.provider.models });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.projects.all });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['system-status'] });
  });
});
