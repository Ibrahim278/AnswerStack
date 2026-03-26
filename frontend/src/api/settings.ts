import { apiFetch } from './client';
import type { SettingsResponse, SettingsUpdate } from '../types';

class SettingsApi {
  async get(): Promise<SettingsResponse> {
    return apiFetch<SettingsResponse>('/settings');
  }

  async update(data: SettingsUpdate): Promise<SettingsResponse> {
    return apiFetch<SettingsResponse>('/settings', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async reset(): Promise<SettingsResponse> {
    return apiFetch<SettingsResponse>('/settings/reset', { method: 'PUT' });
  }
}

export const settingsApi = new SettingsApi();
