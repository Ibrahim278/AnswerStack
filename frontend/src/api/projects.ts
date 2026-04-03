import { apiFetch } from './client';
import type {
  PaginatedResponse,
  ProjectCreate,
  ProjectResponse,
  ProjectUpdate,
} from '@/types';

class ProjectsApi {
  async list(cursor?: string, limit?: number): Promise<PaginatedResponse<ProjectResponse>> {
    const params = new URLSearchParams();
    if (cursor) params.set('cursor', cursor);
    if (limit !== undefined) params.set('limit', String(limit));
    const qs = params.toString();
    return apiFetch<PaginatedResponse<ProjectResponse>>(`/projects${qs ? `?${qs}` : ''}`);
  }

  async get(id: string): Promise<ProjectResponse> {
    return apiFetch<ProjectResponse>(`/projects/${id}`);
  }

  async create(data: ProjectCreate): Promise<ProjectResponse> {
    return apiFetch<ProjectResponse>('/projects', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async update(id: string, data: ProjectUpdate): Promise<ProjectResponse> {
    return apiFetch<ProjectResponse>(`/projects/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async delete(id: string): Promise<void> {
    return apiFetch<void>(`/projects/${id}`, { method: 'DELETE' });
  }

  async activate(id: string): Promise<ProjectResponse> {
    return apiFetch<ProjectResponse>(`/projects/${id}/activate`, { method: 'POST' });
  }
}

export const projectsApi = new ProjectsApi();
