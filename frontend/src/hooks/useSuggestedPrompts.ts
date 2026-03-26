import { useQuery } from '@tanstack/react-query';
import { chatApi } from '../api/chat';
import { queryKeys } from '../api/queryKeys';

export function useSuggestedPrompts(projectId: string) {
  return useQuery({
    queryKey: queryKeys.suggestedPrompts(projectId),
    queryFn: () => chatApi.getSuggestedPrompts(projectId),
    enabled: !!projectId,
    staleTime: 5 * 60 * 1000, // 5 minutes per D-74
    select: (data) => data.prompts,
  });
}
