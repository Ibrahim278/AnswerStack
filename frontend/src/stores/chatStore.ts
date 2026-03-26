import { create } from 'zustand';
import type { SSESourceItem, SSEError, StreamPhase } from '../types';

interface ChatState {
  // Streaming state (D-64)
  isStreaming: boolean;
  streamingMessageId: string | null;
  accumulatedTokens: string;
  currentSources: SSESourceItem[];
  streamPhase: StreamPhase;
  streamError: SSEError | null;

  // Source panel state (D-67)
  sourcePanelOpen: boolean;
  activeSourceMsgId: string | null;

  // Actions
  startStream: (messageId: string) => void;
  setStreamPhase: (phase: StreamPhase) => void;
  appendToken: (token: string) => void;
  setSources: (sources: SSESourceItem[]) => void;
  completeStream: () => void;
  stopStream: () => void;
  setStreamError: (error: SSEError) => void;
  resetStream: () => void;
  prepareStream: () => void;
  openSourcePanel: (msgId: string) => void;
  closeSourcePanel: () => void;
  toggleSourcePanel: () => void;
}

export const useChatStore = create<ChatState>()((set) => ({
  // Initial state
  isStreaming: false,
  streamingMessageId: null,
  accumulatedTokens: '',
  currentSources: [],
  streamPhase: 'idle',
  streamError: null,
  sourcePanelOpen: false,
  activeSourceMsgId: null,

  // Actions
  startStream: (messageId) =>
    set({
      isStreaming: true,
      streamingMessageId: messageId,
      accumulatedTokens: '',
      currentSources: [],
      streamPhase: 'idle',
      streamError: null,
    }),

  setStreamPhase: (phase) => set({ streamPhase: phase }),

  appendToken: (token) =>
    set((state) => ({ accumulatedTokens: state.accumulatedTokens + token })),

  setSources: (sources) => set({ currentSources: sources }),

  completeStream: () =>
    set({
      isStreaming: false,
      streamPhase: 'complete',
    }),

  stopStream: () =>
    set({
      isStreaming: false,
      streamPhase: 'stopped',
    }),

  setStreamError: (error) =>
    set({
      isStreaming: false,
      streamPhase: 'error',
      streamError: error,
    }),

  resetStream: () =>
    set({
      isStreaming: false,
      streamingMessageId: null,
      accumulatedTokens: '',
      currentSources: [],
      streamPhase: 'idle',
      streamError: null,
    }),

  // Prepare for a new stream: reset accumulated state but keep isStreaming=true
  // to prevent the UI from flickering back to empty state between resetStream
  // and the first SSE message_start event.
  prepareStream: () =>
    set({
      isStreaming: true,
      streamingMessageId: null,
      accumulatedTokens: '',
      currentSources: [],
      streamPhase: 'idle',
      streamError: null,
    }),

  openSourcePanel: (msgId) =>
    set({ sourcePanelOpen: true, activeSourceMsgId: msgId }),

  closeSourcePanel: () =>
    set({ sourcePanelOpen: false, activeSourceMsgId: null }),

  toggleSourcePanel: () =>
    set((state) => ({
      sourcePanelOpen: !state.sourcePanelOpen,
      activeSourceMsgId: state.sourcePanelOpen ? null : state.activeSourceMsgId,
    })),
}));
