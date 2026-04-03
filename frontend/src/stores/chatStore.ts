import { create } from 'zustand';
import type { SSESourceItem, SSEError, StreamPhase } from '@/types';
import type {
  MicrophonePermissionState,
  SpeechCapabilityState,
  SpeechErrorNotice,
  SpeechPlaybackState,
  SpeechRecognitionState,
} from '@/types/speech';

interface SpeechCapabilitiesState {
  stt: SpeechCapabilityState;
  tts: SpeechCapabilityState;
}

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

  // Speech state (Phase 08)
  speechCapabilities: SpeechCapabilitiesState;
  microphonePermission: MicrophonePermissionState;
  speechRecognitionState: SpeechRecognitionState;
  speechPlaybackState: SpeechPlaybackState;
  speechDraft: string;
  speechCommittedPrefix: string;
  speechError: SpeechErrorNotice | null;
  activePlaybackMessageId: string | null;
  speechPlaybackErrorMessageId: string | null;
  activeSpeechMode: 'none' | 'recording' | 'playback';

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
  setSpeechCapabilities: (capabilities: SpeechCapabilitiesState) => void;
  setMicrophonePermission: (state: MicrophonePermissionState) => void;
  beginSpeechCapture: (prefix: string) => void;
  setSpeechListening: () => void;
  setSpeechProcessing: () => void;
  updateSpeechDraft: (draft: string) => void;
  commitSpeechCapture: (finalText: string) => void;
  cancelSpeechCapture: () => void;
  setSpeechRecognitionError: (notice: SpeechErrorNotice) => void;
  startSpeechPlayback: (messageId: string) => void;
  setSpeechPlaying: (messageId: string) => void;
  stopSpeechPlayback: () => void;
  setSpeechPlaybackError: (messageId: string, notice: SpeechErrorNotice) => void;
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
  speechCapabilities: { stt: 'unavailable', tts: 'unavailable' },
  microphonePermission: 'unsupported',
  speechRecognitionState: 'unsupported',
  speechPlaybackState: 'idle',
  speechDraft: '',
  speechCommittedPrefix: '',
  speechError: null,
  activePlaybackMessageId: null,
  speechPlaybackErrorMessageId: null,
  activeSpeechMode: 'none',

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

  setSpeechCapabilities: (capabilities) =>
    set((state) => ({
      speechCapabilities: capabilities,
      microphonePermission:
        capabilities.stt === 'available' ? state.microphonePermission : 'unsupported',
      speechRecognitionState:
        capabilities.stt === 'available'
          ? state.speechRecognitionState === 'unsupported'
            ? 'idle'
            : state.speechRecognitionState
          : 'unsupported',
    })),

  setMicrophonePermission: (microphonePermission) => set({ microphonePermission }),

  beginSpeechCapture: (prefix) =>
    set({
      speechRecognitionState: 'arming',
      speechCommittedPrefix: prefix,
      speechDraft: '',
      speechError: null,
      speechPlaybackErrorMessageId: null,
      activeSpeechMode: 'recording',
    }),

  setSpeechListening: () => set({ speechRecognitionState: 'listening' }),

  setSpeechProcessing: () => set({ speechRecognitionState: 'processing' }),

  updateSpeechDraft: (speechDraft) => set({ speechDraft }),

  commitSpeechCapture: (finalText) =>
    set({
      speechDraft: finalText,
      speechRecognitionState: 'idle',
      activeSpeechMode: 'none',
    }),

  cancelSpeechCapture: () =>
    set({
      speechDraft: '',
      speechRecognitionState: 'idle',
      activeSpeechMode: 'none',
    }),

  setSpeechRecognitionError: (notice) =>
    set({
      speechRecognitionState: 'error',
      speechError: notice,
      activeSpeechMode: 'none',
    }),

  startSpeechPlayback: (messageId) =>
    set({
      speechPlaybackState: 'starting',
      activePlaybackMessageId: messageId,
      speechPlaybackErrorMessageId: null,
      speechError: null,
      activeSpeechMode: 'playback',
    }),

  setSpeechPlaying: (messageId) =>
    set({
      speechPlaybackState: 'playing',
      activePlaybackMessageId: messageId,
      activeSpeechMode: 'playback',
    }),

  stopSpeechPlayback: () =>
    set({
      speechPlaybackState: 'stopped',
      activePlaybackMessageId: null,
      activeSpeechMode: 'none',
    }),

  setSpeechPlaybackError: (messageId, notice) =>
    set({
      speechPlaybackState: 'error',
      speechError: notice,
      speechPlaybackErrorMessageId: messageId,
      activePlaybackMessageId: null,
      activeSpeechMode: 'none',
    }),
}));
