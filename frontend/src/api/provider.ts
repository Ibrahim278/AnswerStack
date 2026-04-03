import { apiFetch } from './client';
import type { ConnectionTestResult, ModelListResponse } from '@/types';

class ProviderApi {
  async testConnection(): Promise<ConnectionTestResult> {
    return apiFetch<ConnectionTestResult>('/provider/test-connection', {
      method: 'POST',
    });
  }

  async listModels(): Promise<ModelListResponse> {
    return apiFetch<ModelListResponse>('/provider/models');
  }
}

export const providerApi = new ProviderApi();
