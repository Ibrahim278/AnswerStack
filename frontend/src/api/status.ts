import { apiFetch } from './client';

export interface SystemStatusResponse {
  status: 'ready' | 'indexing' | 'misconfigured' | 'degraded' | 'no_documents' | 'stale';
  provider: {
    configured: boolean;
    connected: boolean;
    last_error: string | null;
  };
  health: {
    database: boolean;
    vector_store: boolean;
  };
  project?: {
    index_status: string;
    documents_total: number;
    documents_stale: number;
    last_indexed: string | null;
    active_job: {
      status: string;
      progress_current: number;
      progress_total: number;
    } | null;
  };
}

class StatusApi {
  async getStatus(projectId?: string): Promise<SystemStatusResponse> {
    const params = new URLSearchParams();
    if (projectId) params.set('project_id', projectId);
    const qs = params.toString();
    return apiFetch<SystemStatusResponse>(`/status${qs ? `?${qs}` : ''}`);
  }
}

export const statusApi = new StatusApi();
