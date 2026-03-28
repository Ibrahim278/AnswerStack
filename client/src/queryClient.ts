import { QueryClient, QueryCache, MutationCache } from '@tanstack/react-query';

interface ApiErrorShape {
  error_code: string;
  message: string;
  retryable: boolean;
  suggested_action: string;
  request_id?: string;
}

function shouldSuppressDetailQueryToast(
  apiError: ApiErrorShape,
  queryKey: readonly unknown[],
): boolean {
  const rootKey = queryKey[0];
  const isDetailLikeQuery =
    rootKey === 'projects' || rootKey === 'sessions' || rootKey === 'system-status';

  if (!isDetailLikeQuery) return false;

  return apiError.error_code.startsWith('validation.') || apiError.error_code.endsWith('.not_found');
}

export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error: Error, query) => {
      const apiError = (error as unknown as Record<string, unknown>).apiError as ApiErrorShape | undefined;
      if (apiError) {
        if (shouldSuppressDetailQueryToast(apiError, query.queryKey)) {
          return;
        }
        console.error(`[QueryError] ${apiError.error_code}: ${apiError.message}`);
      }
    },
  }),
  mutationCache: new MutationCache({
    onError: (error: Error, _variables, _context, mutation) => {
      // Skip global handler if mutation has its own onError
      if (mutation.options.onError) return;
      const apiError = (error as unknown as Record<string, unknown>).apiError as ApiErrorShape | undefined;
      console.error(`[MutationError] ${apiError?.message ?? error.message}`);
    },
  }),
  defaultOptions: {
    queries: {
      retry: (failureCount, error) => {
        const apiError = (error as unknown as Record<string, unknown>).apiError as ApiErrorShape | undefined;
        if (apiError && !apiError.retryable) return false;
        return failureCount < 2;
      },
      staleTime: 30_000,
      refetchOnWindowFocus: true,
    },
    mutations: {
      retry: false,
    },
  },
});
