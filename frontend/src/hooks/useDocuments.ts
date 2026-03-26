import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { documentsApi } from '../api/documents';
import { queryKeys } from '../api/queryKeys';
import type { PaginatedResponse, DocumentResponse } from '../types';

const PROCESSING_STATUSES = ['uploaded', 'parsing', 'indexing'];

export function useDocuments(projectId: string) {
  return useQuery({
    queryKey: queryKeys.documents(projectId),
    queryFn: () => documentsApi.list(projectId),
    enabled: !!projectId,
    refetchInterval: (query) => {
      const data = query.state.data as PaginatedResponse<DocumentResponse> | undefined;
      if (!data) return false;
      const hasProcessing = data.items.some((doc) =>
        PROCESSING_STATUSES.includes(doc.status),
      );
      return hasProcessing ? 2000 : false;
    },
  });
}

export function useUploadDocuments() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ projectId, files }: { projectId: string; files: File[] }) =>
      documentsApi.upload(projectId, files),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.documents(variables.projectId),
      });
    },
  });
}

export function useDeleteDocument() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      projectId,
      documentId,
    }: {
      projectId: string;
      documentId: string;
    }) => documentsApi.delete(projectId, documentId),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.documents(variables.projectId),
      });
    },
  });
}
