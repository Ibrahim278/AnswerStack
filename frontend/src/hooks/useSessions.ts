import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { chatApi } from '../api/chat';
import { queryKeys } from '../api/queryKeys';

export function useSessionList(projectId: string) {
  return useQuery({
    queryKey: queryKeys.sessions.list(projectId),
    queryFn: () => chatApi.listSessions(projectId),
    enabled: !!projectId,
  });
}

export function useSessionDetail(projectId: string, sessionId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.sessions.detail(sessionId ?? ''),
    queryFn: () => chatApi.getSession(projectId, sessionId!),
    enabled: !!projectId && !!sessionId,
  });
}

export function useCreateSession(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (title?: string) => chatApi.createSession(projectId, title),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.sessions.list(projectId) });
    },
  });
}

export function useRenameSession(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ sessionId, title }: { sessionId: string; title: string }) =>
      chatApi.renameSession(projectId, sessionId, title),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.sessions.list(projectId) });
    },
  });
}

export function useClearSession(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (sessionId: string) => chatApi.clearSession(projectId, sessionId),
    onSuccess: (_data, sessionId) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.sessions.list(projectId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.sessions.detail(sessionId) });
    },
  });
}

export function useDeleteSession(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (sessionId: string) => chatApi.deleteSession(projectId, sessionId),
    onSuccess: (_data, sessionId) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.sessions.list(projectId) });
      queryClient.removeQueries({ queryKey: queryKeys.sessions.detail(sessionId) });
    },
  });
}
