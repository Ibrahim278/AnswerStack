import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import { statusApi } from '../api/status';
import { queryKeys } from '../api/queryKeys';

interface UseSystemStatusOptions {
  notifyTransitions?: boolean;
}

export function useSystemStatus(projectId?: string, options?: UseSystemStatusOptions) {
  const previousStatus = useRef<string | null>(null);
  const consecutiveFailures = useRef<number>(0);
  const notifyTransitions = options?.notifyTransitions ?? false;

  const queryResult = useQuery({
    queryKey: queryKeys.systemStatus(projectId),
    queryFn: () => statusApi.getStatus(projectId),
    retry: 3,
    retryDelay: 1000,
    gcTime: 0, // Don't cache errors across refreshes
    refetchInterval: () => {
      if (typeof document !== 'undefined' && document.hidden) return false;
      // When indexing is active, poll more frequently
      if (previousStatus.current === 'indexing') return 2000;
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
  }, [queryResult.isError, queryResult.isSuccess, queryResult.dataUpdatedAt, queryResult.errorUpdatedAt]);

  // Fire transition notifications on status changes
  useEffect(() => {
    if (!notifyTransitions) return;
    if (!queryResult.data) return;

    const currentStatus = queryResult.data.status;
    const prevStatus = previousStatus.current;

    if (prevStatus !== null && prevStatus !== currentStatus) {
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
  if (from === 'indexing' && to === 'ready') {
    notifications.show({
      title: 'Indexing complete',
      message: 'Your index is up to date',
      color: 'green',
      autoClose: 5000,
    });
  } else if (from === 'indexing') {
    notifications.show({
      title: 'Indexing failed',
      message: 'The indexing job did not complete successfully',
      color: 'red',
      autoClose: 5000,
    });
  } else if (to === 'misconfigured') {
    notifications.show({
      title: 'Provider disconnected',
      message: 'The LLM provider is not reachable',
      color: 'yellow',
      autoClose: 5000,
    });
  } else if (to === 'stale') {
    notifications.show({
      title: 'Index out of date',
      message: 'Documents have changed since the last build',
      color: 'blue',
      autoClose: 5000,
    });
  }
}
