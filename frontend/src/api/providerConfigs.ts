import { apiFetch } from './client';
import type {
  ProviderConfigCreate,
  ProviderConfigListResponse,
  ProviderConfigResponse,
  ProviderConfigUpdate,
  SettingsResponse,
} from '@/types';

class ProviderConfigsApi {
  async list(): Promise<ProviderConfigListResponse> {
    return apiFetch<ProviderConfigListResponse>('/providers');
  }

  async create(data: ProviderConfigCreate): Promise<ProviderConfigResponse> {
    return apiFetch<ProviderConfigResponse>('/providers', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async update(id: string, data: ProviderConfigUpdate): Promise<ProviderConfigResponse> {
    return apiFetch<ProviderConfigResponse>(`/providers/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async delete(id: string): Promise<void> {
    await apiFetch<void>(`/providers/${id}`, { method: 'DELETE' });
  }

  async activate(id: string): Promise<SettingsResponse> {
    return apiFetch<SettingsResponse>(`/providers/${id}/activate`, {
      method: 'POST',
    });
  }
}

export const providerConfigsApi = new ProviderConfigsApi();
