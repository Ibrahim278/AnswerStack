import type { PropsWithChildren } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

export function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
      mutations: {
        retry: false,
      },
    },
  });
}

export function createQueryWrapper(queryClient: QueryClient) {
  return function QueryWrapper({ children }: PropsWithChildren) {
    return (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    );
  };
}

export function getQueryRefetchInterval(
  queryClient: QueryClient,
  queryKey: readonly unknown[],
) {
  const query = queryClient.getQueryCache().find({ queryKey });
  if (!query) {
    throw new Error(`Expected query for key ${JSON.stringify(queryKey)} to exist`);
  }

  const { refetchInterval } = query.options;
  return typeof refetchInterval === 'function'
    ? refetchInterval(query)
    : refetchInterval;
}
