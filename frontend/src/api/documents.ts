import { apiFetch, apiUpload } from './client';
import type {
  PaginatedResponse,
  DocumentResponse,
  DocumentUploadResult,
} from '@/types';

class DocumentsApi {
  async list(
    projectId: string,
    cursor?: string,
    limit?: number,
  ): Promise<PaginatedResponse<DocumentResponse>> {
    const params = new URLSearchParams();
    if (cursor) params.set('cursor', cursor);
    if (limit !== undefined) params.set('limit', String(limit));
    const qs = params.toString();
    return apiFetch<PaginatedResponse<DocumentResponse>>(
      `/projects/${projectId}/documents${qs ? `?${qs}` : ''}`,
    );
  }

  async get(projectId: string, documentId: string): Promise<DocumentResponse> {
    return apiFetch<DocumentResponse>(
      `/projects/${projectId}/documents/${documentId}`,
    );
  }

  async upload(projectId: string, files: File[]): Promise<DocumentUploadResult> {
    const formData = new FormData();
    for (const file of files) {
      formData.append('files', file);
    }
    return apiUpload<DocumentUploadResult>(
      `/projects/${projectId}/documents`,
      formData,
    );
  }

  async delete(projectId: string, documentId: string): Promise<void> {
    return apiFetch<void>(
      `/projects/${projectId}/documents/${documentId}`,
      { method: 'DELETE' },
    );
  }
}

export const documentsApi = new DocumentsApi();
