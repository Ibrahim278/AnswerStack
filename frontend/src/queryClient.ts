import { QueryClient, QueryCache, MutationCache } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';

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
        // Use query key as notification ID to deduplicate error toasts
        const notificationId = `query-error-${JSON.stringify(query.queryKey)}`;
        notifications.show({
          id: notificationId,
          title: 'Error',
          message: apiError.message,
          color: 'red',
          autoClose: 5000,
        });
      }
    },
  }),
  mutationCache: new MutationCache({
    onError: (error: Error, _variables, _context, mutation) => {
      // Skip global handler if mutation has its own onError
      if (mutation.options.onError) return;
      const apiError = (error as unknown as Record<string, unknown>).apiError as ApiErrorShape | undefined;
      notifications.show({
        title: 'Error',
        message: apiError?.message ?? error.message,
        color: 'red',
        autoClose: 5000,
      });
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
