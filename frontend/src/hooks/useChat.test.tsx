import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { useChatStore } from '@/stores/chatStore';
import { queryKeys } from '@/api/queryKeys';
import { useChat } from './useChat';
import type { ReactNode } from 'react';
import type { ChatSessionDetailResponse } from '@/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resetChatStore() {
  useChatStore.setState(useChatStore.getInitialState(), true);
}

let queryClient: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

/** Build a mock fetchEventSource that replays SSE events synchronously. */
function createMockSSE(events: Array<{ event: string; data: string }>) {
  return vi.fn(async (_url: string, opts: Record<string, unknown>) => {
    const onmessage = opts.onmessage as (ev: { event: string; data: string }) => void;
    const onopen = opts.onopen as (response: { ok: boolean }) => void;

    await onopen({ ok: true });
    for (const ev of events) {
      onmessage(ev);
    }
  });
}

const SESSION_ID = 'aaaa-1111';
const MSG_ID = 'bbbb-2222';
const PROJECT_ID = 'proj-1';

function standardSSEEvents(sessionId = SESSION_ID, messageId = MSG_ID) {
  return [
    { event: 'message_start', data: JSON.stringify({ session_id: sessionId, message_id: messageId }) },
    { event: 'retrieval_start', data: '{}' },
    { event: 'sources', data: '[]' },
    { event: 'token', data: JSON.stringify('Hello') },
    { event: 'token', data: JSON.stringify(' world') },
    { event: 'message_complete', data: JSON.stringify({ sources: [] }) },
    { event: 'done', data: '{}' },
  ];
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useChat', () => {
  beforeEach(() => {
    resetChatStore();
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
  });

  describe('retry sends isRetry flag', () => {
    it('passes retry: true in request body when retrying', async () => {
      const mockSSE = createMockSSE(standardSSEEvents());
      const { result } = renderHook(
        () => useChat({ projectId: PROJECT_ID, fetchFn: mockSSE as never }),
        { wrapper },
      );

      // Initial send
      await act(async () => {
        await result.current.sendMessage({ question: 'What is X?', sessionId: SESSION_ID });
      });

      mockSSE.mockClear();
      const retrySSE = createMockSSE(standardSSEEvents(SESSION_ID, 'cccc-3333'));
      const { result: result2 } = renderHook(
        () => useChat({ projectId: PROJECT_ID, fetchFn: retrySSE as never }),
        { wrapper },
      );

      // Send initial message so refs are populated
      await act(async () => {
        await result2.current.sendMessage({ question: 'What is X?', sessionId: SESSION_ID });
      });

      retrySSE.mockClear();
      // Now retry
      await act(async () => {
        result2.current.retry();
      });

      // Wait for the retry send to complete
      await vi.waitFor(() => {
        expect(retrySSE).toHaveBeenCalled();
      });

      const callArgs = retrySSE.mock.calls[0];
      const body = JSON.parse(callArgs[1].body as string);
      expect(body.retry).toBe(true);
    });

    it('passes retry: false for normal sends', async () => {
      const mockSSE = createMockSSE(standardSSEEvents());
      const { result } = renderHook(
        () => useChat({ projectId: PROJECT_ID, fetchFn: mockSSE as never }),
        { wrapper },
      );

      await act(async () => {
        await result.current.sendMessage({ question: 'What is X?', sessionId: SESSION_ID });
      });

      const body = JSON.parse(mockSSE.mock.calls[0][1].body as string);
      expect(body.retry).toBe(false);
    });
  });

  describe('retry cache update replaces last assistant message', () => {
    it('replaces last assistant message on retry instead of appending', async () => {
      const mockSSE = createMockSSE(standardSSEEvents());
      const { result } = renderHook(
        () => useChat({ projectId: PROJECT_ID, fetchFn: mockSSE as never }),
        { wrapper },
      );

      // Seed the cache with initial messages
      const initialMessages = [
        { id: 'u1', session_id: SESSION_ID, role: 'user', content: 'What is X?', sources_json: null, created_at: '2026-01-01' },
        { id: 'a1', session_id: SESSION_ID, role: 'assistant', content: 'Old answer', sources_json: null, created_at: '2026-01-01' },
      ];
      queryClient.setQueryData(queryKeys.sessions.detail(SESSION_ID), {
        id: SESSION_ID,
        project_id: PROJECT_ID,
        title: 'Test',
        created_at: '2026-01-01',
        updated_at: '2026-01-01',
        messages: initialMessages,
      } as ChatSessionDetailResponse);

      // Send retry
      await act(async () => {
        await result.current.sendMessage({ question: 'What is X?', sessionId: SESSION_ID, isRetry: true });
      });

      const cached = queryClient.getQueryData<ChatSessionDetailResponse>(
        queryKeys.sessions.detail(SESSION_ID),
      );

      // Should still have exactly 2 messages, not 3 or 4
      expect(cached?.messages).toHaveLength(2);
      expect(cached?.messages[0].role).toBe('user');
      expect(cached?.messages[0].content).toBe('What is X?');
      expect(cached?.messages[1].role).toBe('assistant');
      // The assistant message should have the new ID from the retry stream
      expect(cached?.messages[1].id).toBe(MSG_ID);
      expect(cached?.messages[1].content).toBe('Hello world');
    });
  });

  describe('abort resets streaming state', () => {
    it('resets isStreaming and accumulatedTokens on abort', async () => {
      // Create SSE that never completes (simulates in-progress stream)
      const neverCompleteSSE = vi.fn(async (_url: string, opts: Record<string, unknown>) => {
        const onopen = opts.onopen as (response: { ok: boolean }) => void;
        const onmessage = opts.onmessage as (ev: { event: string; data: string }) => void;
        await onopen({ ok: true });
        onmessage({ event: 'message_start', data: JSON.stringify({ session_id: SESSION_ID, message_id: MSG_ID }) });
        onmessage({ event: 'token', data: JSON.stringify('partial') });
        // Stream hangs here — never sends message_complete
        await new Promise(() => {}); // never resolves
      });

      const { result } = renderHook(
        () => useChat({ projectId: PROJECT_ID, fetchFn: neverCompleteSSE as never }),
        { wrapper },
      );

      // Start streaming (don't await — it never completes)
      act(() => {
        void result.current.sendMessage({ question: 'Test', sessionId: SESSION_ID });
      });

      // Wait for streaming to start
      await vi.waitFor(() => {
        expect(useChatStore.getState().isStreaming).toBe(true);
      });

      // Abort
      act(() => {
        result.current.abort();
      });

      expect(useChatStore.getState().isStreaming).toBe(false);
      expect(useChatStore.getState().accumulatedTokens).toBe('');
      expect(useChatStore.getState().streamPhase).toBe('idle');
    });
  });

  describe('stop vs abort behavior', () => {
    it('stop sets phase to stopped, abort resets to idle', async () => {
      const neverCompleteSSE = vi.fn(async (_url: string, opts: Record<string, unknown>) => {
        const onopen = opts.onopen as (response: { ok: boolean }) => void;
        const onmessage = opts.onmessage as (ev: { event: string; data: string }) => void;
        await onopen({ ok: true });
        onmessage({ event: 'message_start', data: JSON.stringify({ session_id: SESSION_ID, message_id: MSG_ID }) });
        onmessage({ event: 'token', data: JSON.stringify('data') });
        await new Promise(() => {});
      });

      const { result } = renderHook(
        () => useChat({ projectId: PROJECT_ID, fetchFn: neverCompleteSSE as never }),
        { wrapper },
      );

      act(() => {
        void result.current.sendMessage({ question: 'Test', sessionId: SESSION_ID });
      });

      await vi.waitFor(() => {
        expect(useChatStore.getState().isStreaming).toBe(true);
      });

      // stop() preserves the stopped state (user clicked stop)
      act(() => {
        result.current.stop();
      });
      expect(useChatStore.getState().streamPhase).toBe('stopped');

      // Reset for abort test
      resetChatStore();
      const neverCompleteSSE2 = vi.fn(async (_url: string, opts: Record<string, unknown>) => {
        const onopen = opts.onopen as (response: { ok: boolean }) => void;
        const onmessage = opts.onmessage as (ev: { event: string; data: string }) => void;
        await onopen({ ok: true });
        onmessage({ event: 'message_start', data: JSON.stringify({ session_id: SESSION_ID, message_id: MSG_ID }) });
        onmessage({ event: 'token', data: JSON.stringify('data') });
        await new Promise(() => {});
      });

      const { result: result2 } = renderHook(
        () => useChat({ projectId: PROJECT_ID, fetchFn: neverCompleteSSE2 as never }),
        { wrapper },
      );

      act(() => {
        void result2.current.sendMessage({ question: 'Test', sessionId: SESSION_ID });
      });

      await vi.waitFor(() => {
        expect(useChatStore.getState().isStreaming).toBe(true);
      });

      // abort() fully resets (session navigation)
      act(() => {
        result2.current.abort();
      });
      expect(useChatStore.getState().streamPhase).toBe('idle');
    });
  });
});
