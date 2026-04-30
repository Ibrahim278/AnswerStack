import { useQuery } from '@tanstack/react-query';
import { chatApi } from '@/api/chat';
import { queryKeys } from '@/api/queryKeys';

/** Generic prompts shown when the backend has no document-specific suggestions. */
export const FALLBACK_PROMPTS = [
  'What are the key findings?',
  'Summarize the main points',
  'What are the trends?',
  'Compare the data across documents',
] as const;

/**
 * Fetches LLM-generated suggested prompts for a project's chat empty state.
 *
 * Returns pre-cached prompts generated from project documents after indexing.
 * Falls back to generic prompts when the API is unavailable or returns no data.
 */
export function useSuggestedPrompts(projectId: string) {
  const { data, isLoading } = useQuery({
    queryKey: queryKeys.suggestedPrompts(projectId),
    queryFn: () => chatApi.getSuggestedPrompts(projectId),
    enabled: !!projectId,
    staleTime: 5 * 60 * 1000, // 5 minutes — matches backend cache TTL
    gcTime: 10 * 60 * 1000,   // keep in GC for 10 minutes
    refetchOnWindowFocus: false,
  });

  const prompts: readonly string[] =
    data?.prompts && data.prompts.length > 0
      ? data.prompts
      : FALLBACK_PROMPTS;

  return { prompts, isLoading } as const;
}
