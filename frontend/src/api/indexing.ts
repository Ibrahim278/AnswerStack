import { apiFetch } from './client';
import type {
  IndexingStatusResponse,
  IndexingTriggerResponse,
  IndexingJobResponse,
} from '../types';

class IndexingApi {
  async getStatus(projectId: string): Promise<IndexingStatusResponse> {
    return apiFetch<IndexingStatusResponse>(
      `/projects/${projectId}/indexing/status`,
    );
  }

  async build(projectId: string): Promise<IndexingTriggerResponse> {
    return apiFetch<IndexingTriggerResponse>(
      `/projects/${projectId}/indexing/build`,
      { method: 'POST' },
    );
  }

  async cancel(projectId: string): Promise<IndexingJobResponse> {
    return apiFetch<IndexingJobResponse>(
      `/projects/${projectId}/indexing/cancel`,
      { method: 'POST' },
    );
  }

  async retry(projectId: string): Promise<IndexingTriggerResponse> {
    return apiFetch<IndexingTriggerResponse>(
      `/projects/${projectId}/indexing/retry`,
      { method: 'POST' },
    );
  }
}

export const indexingApi = new IndexingApi();
