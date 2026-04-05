import { apiFetch } from './client';
import type { ConnectionTestResult, ModelListResponse } from '@/types';

class ProviderApi {
  async testConnection(): Promise<ConnectionTestResult> {
    return apiFetch<ConnectionTestResult>('/provider/test-connection', {
      method: 'POST',
    });
  }

  async listModels(type?: 'chat' | 'embedding'): Promise<ModelListResponse> {
    const params = type ? `?type=${type}` : '';
    return apiFetch<ModelListResponse>(`/provider/models${params}`);
  }
}

export const providerApi = new ProviderApi();
