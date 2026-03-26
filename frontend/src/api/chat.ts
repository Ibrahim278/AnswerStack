import { apiFetch } from './client';
import type {
  ChatSessionResponse,
  ChatSessionDetailResponse,
  SuggestedPromptsResponse,
} from '../types';

class ChatApi {
  async listSessions(projectId: string): Promise<ChatSessionResponse[]> {
    return apiFetch<ChatSessionResponse[]>(`/projects/${projectId}/chat/sessions`);
  }

  async getSession(projectId: string, sessionId: string): Promise<ChatSessionDetailResponse> {
    return apiFetch<ChatSessionDetailResponse>(
      `/projects/${projectId}/chat/sessions/${sessionId}`,
    );
  }

  async createSession(projectId: string, title?: string): Promise<ChatSessionResponse> {
    return apiFetch<ChatSessionResponse>(`/projects/${projectId}/chat/sessions`, {
      method: 'POST',
      body: JSON.stringify({ title: title ?? null }),
    });
  }

  async renameSession(
    projectId: string,
    sessionId: string,
    title: string,
  ): Promise<ChatSessionResponse> {
    return apiFetch<ChatSessionResponse>(
      `/projects/${projectId}/chat/sessions/${sessionId}`,
      { method: 'PUT', body: JSON.stringify({ title }) },
    );
  }

  async clearSession(projectId: string, sessionId: string): Promise<void> {
    return apiFetch<void>(
      `/projects/${projectId}/chat/sessions/${sessionId}/clear`,
      { method: 'POST' },
    );
  }

  async deleteSession(projectId: string, sessionId: string): Promise<void> {
    return apiFetch<void>(
      `/projects/${projectId}/chat/sessions/${sessionId}`,
      { method: 'DELETE' },
    );
  }

  async getSuggestedPrompts(projectId: string): Promise<SuggestedPromptsResponse> {
    return apiFetch<SuggestedPromptsResponse>(
      `/projects/${projectId}/suggested-prompts`,
      { method: 'POST' },
    );
  }
}

export const chatApi = new ChatApi();
