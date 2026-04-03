import { useRef, useCallback, useEffect } from 'react';
import { fetchEventSource } from '@microsoft/fetch-event-source';
import { useQueryClient } from '@tanstack/react-query';
import { useChatStore } from '@/stores/chatStore';
import { queryKeys } from '@/api/queryKeys';
import type {
  SSEMessageStart,
  SSESourceItem,
  SSEMessageComplete,
  SSEError,
  ChatSessionDetailResponse,
  ChatMessageResponse,
} from '@/types';

interface UseChatOptions {
  projectId: string;
  onSessionCreated?: (sessionId: string) => void;
  fetchFn?: typeof fetchEventSource; // D-95: injectable for testing
}

interface SendMessageParams {
  question: string;
  sessionId?: string;
  isRetry?: boolean;
}

export function useChat({ projectId, onSessionCreated, fetchFn }: UseChatOptions) {
  const abortControllerRef = useRef<AbortController | null>(null);
  const queryClient = useQueryClient();
  const sessionIdRef = useRef<string | null>(null);
  const userQuestionRef = useRef<string>('');
  const lastEventTimeRef = useRef<number>(Date.now());
  const heartbeatTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Subscribe only to isStreaming — actions are accessed via getState() in
  // callbacks so that token-level store updates don't re-render this hook's
  // consumer (ChatPage).
  const isStreaming = useChatStore((s) => s.isStreaming);

  const sseFn = fetchFn ?? fetchEventSource;

  // Heartbeat timeout detection (D-62): 30s no-event = stale connection
  const startHeartbeatMonitor = useCallback(() => {
    lastEventTimeRef.current = Date.now();
    if (heartbeatTimerRef.current) clearInterval(heartbeatTimerRef.current);
    heartbeatTimerRef.current = setInterval(() => {
      if (Date.now() - lastEventTimeRef.current > 30000) {
        // Stale connection -- abort will trigger onerror -> reconnect
        abortControllerRef.current?.abort();
      }
    }, 5000);
  }, []);

  const stopHeartbeatMonitor = useCallback(() => {
    if (heartbeatTimerRef.current) {
      clearInterval(heartbeatTimerRef.current);
      heartbeatTimerRef.current = null;
    }
  }, []);

  // Optimistic cache update after stream (D-66)
  const updateSessionCache = useCallback(
    (sessionId: string, userMsg: ChatMessageResponse, assistantMsg: ChatMessageResponse, isRetry?: boolean) => {
      queryClient.setQueryData<ChatSessionDetailResponse>(
        queryKeys.sessions.detail(sessionId),
        (old) => {
          if (!old) return old;
          let messages = [...old.messages];

          if (isRetry) {
            // Replace the last assistant message instead of appending
            const lastAssistantIdx = messages.findLastIndex((m) => m.role === 'assistant');
            if (lastAssistantIdx !== -1) {
              messages[lastAssistantIdx] = assistantMsg;
            } else {
              messages.push(assistantMsg);
            }
          } else {
            const lastMessage = messages[messages.length - 1];
            const userAlreadyPresent =
              lastMessage?.role === 'user' && lastMessage.content === userMsg.content;

            if (!userAlreadyPresent) {
              messages.push(userMsg);
            }

            const assistantAlreadyPresent = messages.some((message) => message.id === assistantMsg.id);
            if (!assistantAlreadyPresent) {
              messages.push(assistantMsg);
            }
          }

          return { ...old, messages };
        },
      );
      // Invalidate session list to update title/timestamps (D-68).
      // Session detail is NOT invalidated here — the optimistic update above
      // already has the correct content. Immediate invalidation would refetch
      // from the server where messages have different IDs (DB-generated vs
      // SSE-generated), causing AnimatePresence to re-key and flash.
      void queryClient.invalidateQueries({ queryKey: queryKeys.sessions.list(projectId) });
    },
    [queryClient, projectId],
  );

  const sendMessage = useCallback(
    async ({ question, sessionId, isRetry }: SendMessageParams) => {
      // Abort any existing stream (D-70)
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      const controller = new AbortController();
      abortControllerRef.current = controller;
      sessionIdRef.current = sessionId ?? null;
      userQuestionRef.current = question;

      let assistantMessageId = '';
      let retryCount = 0;
      const MAX_RETRIES = 3; // D-59

      // Pre-create user message for optimistic update
      const userMessage: ChatMessageResponse = {
        id: self.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        session_id: sessionId ?? '',
        role: 'user',
        content: question,
        sources_json: null,
        created_at: new Date().toISOString(),
      };

      // Use prepareStream instead of resetStream to keep isStreaming=true,
      // preventing the UI from flickering back to empty state (ChatEmptyState)
      // before the first SSE event arrives. This avoids "Maximum update depth
      // exceeded" crashes from rapid mount/unmount cycles.
      useChatStore.getState().prepareStream();

      // On retry, optimistically remove the old assistant message from the cache
      // so it doesn't render alongside the new streaming response.
      if (isRetry && sessionId) {
        queryClient.setQueryData<ChatSessionDetailResponse>(
          queryKeys.sessions.detail(sessionId),
          (old) => {
            if (!old) return old;
            const messages = [...old.messages];
            const lastAssistantIdx = messages.findLastIndex((m) => m.role === 'assistant');
            if (lastAssistantIdx !== -1) {
              messages.splice(lastAssistantIdx, 1);
            }
            return { ...old, messages };
          },
        );
      }

      try {
        await sseFn(`/api/v1/projects/${projectId}/chat/stream`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            question,
            session_id: sessionId ?? null,
            retry: isRetry ?? false,
          }),
          signal: controller.signal,

          async onopen(response) {
            if (response.ok) {
              retryCount = 0;
              startHeartbeatMonitor();
              return;
            }
            // Non-retryable errors
            const body = await response.json().catch(() => null);
            throw new Error(
              (body as { message?: string } | null)?.message ??
                `SSE open failed: ${response.status}`,
            );
          },

          onmessage(event) {
            lastEventTimeRef.current = Date.now();
            const store = useChatStore.getState();

            switch (event.event) {
              case 'message_start': {
                const data: SSEMessageStart = JSON.parse(event.data);
                assistantMessageId = data.message_id;
                sessionIdRef.current = data.session_id;
                // Update user message session_id now that we know it
                userMessage.session_id = data.session_id;
                store.startStream(data.message_id);
                // Notify parent of new session (D-69: for router.replace)
                if (!sessionId && onSessionCreated) {
                  onSessionCreated(data.session_id);
                }
                break;
              }
              case 'retrieval_start': {
                // D-88: signal-only event
                store.setStreamPhase('searching');
                break;
              }
              case 'sources': {
                const sources: SSESourceItem[] = JSON.parse(event.data);
                store.setSources(sources);
                store.setStreamPhase('generating');
                break;
              }
              case 'token': {
                // Token data is raw string, not JSON (per backend implementation)
                store.appendToken(event.data);
                break;
              }
              case 'message_complete': {
                const completeData = JSON.parse(event.data) as SSEMessageComplete;
                // Update sources to only cited ones (backend filters after LLM response)
                const citedSources: SSESourceItem[] = completeData.sources ?? [];
                if (citedSources.length > 0 || completeData.sources !== undefined) {
                  store.setSources(citedSources);
                }

                // Optimistic cache update (D-66) — must happen BEFORE
                // completeStream() so the message is in the query cache
                // when isStreaming flips to false, avoiding a flash where
                // neither StreamingMessage nor the cached message renders.
                const currentSessionId = sessionIdRef.current;
                if (currentSessionId) {
                  const { accumulatedTokens } = useChatStore.getState();
                  const assistantMessage: ChatMessageResponse = {
                    id: assistantMessageId,
                    session_id: currentSessionId,
                    role: 'assistant',
                    content: accumulatedTokens,
                    sources_json: citedSources,
                    created_at: new Date().toISOString(),
                  };
                  updateSessionCache(currentSessionId, userMessage, assistantMessage, isRetry);
                }
                store.completeStream();
                break;
              }
              case 'error': {
                const errorData: SSEError = JSON.parse(event.data);
                useChatStore.getState().setStreamError(errorData);
                break;
              }
              case 'done': {
                stopHeartbeatMonitor();
                break;
              }
              // Ignore unknown events (including ping heartbeats)
            }
          },

          onerror(err) {
            retryCount++;
            if (retryCount >= MAX_RETRIES || controller.signal.aborted) {
              stopHeartbeatMonitor();
              // If we were streaming, save partial state
              if (useChatStore.getState().isStreaming) {
                useChatStore.getState().setStreamError({
                  code: 'connection.lost',
                  message: 'Connection lost. Partial answer saved.',
                });
              }
              throw err; // Stop retrying
            }
            return 1000; // Retry after 1s (D-59)
          },

          openWhenHidden: true, // Keep connection during tab switches
        });
      } catch (err) {
        stopHeartbeatMonitor();
        // AbortError is expected from stop generation (D-60)
        if (err instanceof DOMException && err.name === 'AbortError') {
          // Stop was intentional -- stream already in 'stopped' state
          return;
        }
        // Only set error if not already set by onerror handler
        const state = useChatStore.getState();
        if (state.streamPhase !== 'error') {
          state.setStreamError({
            code: 'connection.error',
            message: 'Failed to connect to the server. Please try again.',
          });
        }
      }
    },
    [projectId, sseFn, onSessionCreated, updateSessionCache, startHeartbeatMonitor, stopHeartbeatMonitor],
  );

  // Stop generation (CHAT-05, D-49, D-60)
  const stop = useCallback(() => {
    abortControllerRef.current?.abort();
    stopHeartbeatMonitor();
    useChatStore.getState().stopStream();
  }, [stopHeartbeatMonitor]);

  // Retry last message (CHAT-06, D-53)
  // Messages live in TanStack Query (not the Zustand store), so we look them
  // up from the query cache when the ref hasn't been set yet.
  const retry = useCallback(() => {
    let question = userQuestionRef.current;
    let sid = sessionIdRef.current;

    // Fall back to query cache for existing sessions
    if (!question || !sid) {
      const queries = queryClient.getQueriesData<ChatSessionDetailResponse>({
        queryKey: ['sessions'],
        exact: false,
      });
      for (const [, data] of queries) {
        const msgs = data?.messages;
        if (!msgs?.length) continue;
        if (!sid) {
          sid = msgs[0].session_id;
        }
        if (!question) {
          for (let i = msgs.length - 1; i >= 0; i--) {
            if (msgs[i].role === 'user') {
              question = msgs[i].content;
              break;
            }
          }
        }
        if (question && sid) break;
      }
    }

    if (!question) return;
    void sendMessage({ question, sessionId: sid ?? undefined, isRetry: true });
  }, [sendMessage, queryClient]);

  // Silently abort the active stream and reset state (used on session navigation)
  const abort = useCallback(() => {
    abortControllerRef.current?.abort();
    stopHeartbeatMonitor();
    useChatStore.getState().resetStream();
  }, [stopHeartbeatMonitor]);

  // Cleanup on unmount: abort any active stream and clear heartbeat timer
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
      if (heartbeatTimerRef.current) {
        clearInterval(heartbeatTimerRef.current);
        heartbeatTimerRef.current = null;
      }
    };
  }, []);

  return {
    sendMessage,
    stop,
    retry,
    abort,
    isStreaming,
  };
}
