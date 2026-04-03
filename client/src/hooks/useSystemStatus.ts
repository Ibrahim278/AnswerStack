import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { statusApi } from '@/api/status';
import { queryKeys } from '@/api/queryKeys';
import { isValidUuid } from '@/utils/isValidUuid';

interface UseSystemStatusOptions {
  notifyTransitions?: boolean;
}

export function useSystemStatus(projectId?: string, options?: UseSystemStatusOptions) {
  const previousStatus = useRef<string | null>(null);
  const consecutiveFailures = useRef<number>(0);
  const notifyTransitions = options?.notifyTransitions ?? false;
  const hasProjectContext = projectId !== undefined;
  const normalizedProjectId = projectId?.trim() || undefined;
  const shouldFetch = normalizedProjectId
    ? isValidUuid(normalizedProjectId)
    : !hasProjectContext;

  const queryResult = useQuery({
    queryKey: queryKeys.systemStatus(normalizedProjectId),
    queryFn: () => statusApi.getStatus(normalizedProjectId),
    enabled: shouldFetch,
    retry: 3,
    retryDelay: 1000,
    gcTime: 0, // Don't cache errors across refreshes
    refetchInterval: (query) => {
      if (typeof document !== 'undefined' && document.hidden) return false;
      const currentStatus = query.state.data?.status;
      // When indexing is active, poll more frequently
      if (currentStatus === 'indexing') return 2000;
      return 5000;
    },
    refetchIntervalInBackground: false,
  });

  // Track consecutive failures for connection overlay
  useEffect(() => {
    if (queryResult.isError) {
      consecutiveFailures.current += 1;
    }
    if (queryResult.isSuccess) {
      consecutiveFailures.current = 0;
    }
  }, [queryResult.isError, queryResult.isSuccess]);

  // Fire transition notifications on status changes
  useEffect(() => {
    if (!queryResult.data) return;

    const currentStatus = queryResult.data.status;
    const prevStatus = previousStatus.current;

    if (notifyTransitions && prevStatus !== null && prevStatus !== currentStatus) {
      fireTransitionNotification(prevStatus, currentStatus);
    }

    previousStatus.current = currentStatus;
  }, [notifyTransitions, queryResult.data]);

  const showOverlay = consecutiveFailures.current >= 5;

  return { ...queryResult, showOverlay };
}

function fireTransitionNotification(
  from: string,
  to: string,
) {
  // Transition notifications using console logging.
  // Components can subscribe to useSystemStatus and render their own toast/notification UI.
  if (from === 'indexing' && to === 'ready') {
    console.info('[SystemStatus] Indexing complete: Your index is up to date');
  } else if (from === 'indexing') {
    console.warn('[SystemStatus] Indexing failed: The indexing job did not complete successfully');
  } else if (to === 'misconfigured') {
    console.warn('[SystemStatus] Provider disconnected: The LLM provider is not reachable');
  } else if (to === 'stale') {
    console.info('[SystemStatus] Index out of date: Documents have changed since the last build');
  }
}
