import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as speechLib from '@/lib/speech';
import { useChatStore } from '@/stores/chatStore';
import type {
  MicrophonePermissionState,
  SpeechRecognitionEventLike,
  SpeechRecognitionLike,
} from '@/types/speech';
import { useSpeechRecognition } from './useSpeechRecognition';

function resetChatStore() {
  useChatStore.setState(useChatStore.getInitialState(), true);
}

function createRecognitionResult(transcript: string): SpeechRecognitionEventLike {
  return {
    resultIndex: 0,
    results: {
      length: 1,
      0: {
        isFinal: false,
        length: 1,
        0: { transcript },
      },
    },
  } as unknown as SpeechRecognitionEventLike;
}

function createMockRecognition() {
  const recognition: SpeechRecognitionLike = {
    continuous: true,
    interimResults: false,
    lang: '',
    maxAlternatives: 0,
    onstart: null,
    onresult: null,
    onerror: null,
    onend: null,
    start: vi.fn(),
    stop: vi.fn(),
    abort: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  };

  return recognition;
}

describe('useSpeechRecognition', () => {
  beforeEach(() => {
    resetChatStore();
    vi.restoreAllMocks();
    vi.spyOn(speechLib, 'watchMicrophonePermission').mockResolvedValue(() => {});
  });

  afterEach(() => {
    resetChatStore();
  });

  it('starts, renders interim text, and commits while preserving the original prefix', async () => {
    const recognition = createMockRecognition();
    const onInterimText = vi.fn();
    const onCommit = vi.fn();
    const onCancel = vi.fn();

    const { result } = renderHook(() =>
      useSpeechRecognition({
        value: 'Existing: ',
        onInterimText,
        onCommit,
        onCancel,
        recognitionFactory: () => recognition,
        queryPermission: async () => 'granted',
      }),
    );

    await act(async () => {
      await result.current.startCapture();
    });

    expect(recognition.continuous).toBe(false);
    expect(recognition.interimResults).toBe(true);
    expect(recognition.lang).toBe('en-US');
    expect(recognition.maxAlternatives).toBe(1);

    act(() => {
      recognition.onstart?.(new Event('start'));
      recognition.onresult?.(createRecognitionResult('hello world'));
    });

    expect(onInterimText).toHaveBeenCalledWith('Existing: hello world');
    expect(useChatStore.getState().speechDraft).toBe('Existing: hello world');

    act(() => {
      result.current.commitCapture();
    });

    expect(recognition.stop).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith('Existing: hello world');
    expect(useChatStore.getState().speechRecognitionState).toBe('idle');
    expect(useChatStore.getState().activeSpeechMode).toBe('none');
  });

  it('restores the committed prefix when capture is cancelled', async () => {
    const recognition = createMockRecognition();
    const onCancel = vi.fn();

    const { result } = renderHook(() =>
      useSpeechRecognition({
        value: 'Draft: ',
        onInterimText: vi.fn(),
        onCommit: vi.fn(),
        onCancel,
        recognitionFactory: () => recognition,
        queryPermission: async () => 'granted',
      }),
    );

    await act(async () => {
      await result.current.startCapture();
    });

    act(() => {
      recognition.onstart?.(new Event('start'));
      recognition.onresult?.(createRecognitionResult('partial transcript'));
      result.current.cancelCapture();
    });

    expect(recognition.abort).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledWith('Draft: ');
    expect(useChatStore.getState().speechDraft).toBe('');
    expect(useChatStore.getState().speechRecognitionState).toBe('idle');
  });

  it('surfaces a stable pending notice when the microphone prompt is ignored', async () => {
    const onCancel = vi.fn();

    const { result } = renderHook(() =>
      useSpeechRecognition({
        value: 'Question',
        onInterimText: vi.fn(),
        onCommit: vi.fn(),
        onCancel,
        recognitionFactory: createMockRecognition,
        queryPermission: async () => 'prompt',
        requestPreflight: async () => ({ ok: false, reason: 'pending' }),
      }),
    );

    await act(async () => {
      await result.current.startCapture();
    });

    expect(onCancel).toHaveBeenCalledWith('Question');
    expect(useChatStore.getState().microphonePermission).toBe('pending');
    expect(useChatStore.getState().speechError).toMatchObject({
      title: 'Microphone permission pending',
      message: expect.stringContaining('Chromium is still waiting'),
    });
  });

  it('downgrades to denied and cancels an active capture when permission is revoked', async () => {
    const recognition = createMockRecognition();
    const onCancel = vi.fn();
    let watcher: ((state: MicrophonePermissionState) => void) | undefined;

    vi.spyOn(speechLib, 'watchMicrophonePermission').mockImplementation(async (onChange) => {
      watcher = onChange;
      return () => {};
    });

    const { result } = renderHook(() =>
      useSpeechRecognition({
        value: 'Restore me',
        onInterimText: vi.fn(),
        onCommit: vi.fn(),
        onCancel,
        recognitionFactory: () => recognition,
        queryPermission: async () => 'granted',
      }),
    );

    await act(async () => {
      await result.current.startCapture();
    });

    act(() => {
      recognition.onstart?.(new Event('start'));
    });

    act(() => {
      watcher?.('denied');
    });

    expect(recognition.abort).toHaveBeenCalledTimes(1);
    expect(useChatStore.getState().microphonePermission).toBe('denied');
    expect(useChatStore.getState().speechError?.code).toBe('not-allowed');
    expect(onCancel).toHaveBeenCalledWith('Restore me');
  });

  it('maps no-speech and not-allowed recognition errors to stable notices', async () => {
    const recognition = createMockRecognition();

    const { result } = renderHook(() =>
      useSpeechRecognition({
        value: '',
        onInterimText: vi.fn(),
        onCommit: vi.fn(),
        onCancel: vi.fn(),
        recognitionFactory: () => recognition,
        queryPermission: async () => 'granted',
      }),
    );

    await act(async () => {
      await result.current.startCapture();
    });

    act(() => {
      recognition.onerror?.({ error: 'no-speech' } as Event & { error: string });
    });

    expect(useChatStore.getState().speechError).toMatchObject({
      code: 'no-speech',
      title: 'No speech detected',
    });

    await act(async () => {
      await result.current.startCapture();
    });

    act(() => {
      recognition.onerror?.({ error: 'not-allowed' } as Event & { error: string });
    });

    await waitFor(() => {
      expect(useChatStore.getState().speechError).toMatchObject({
        code: 'not-allowed',
        title: 'Microphone access blocked',
      });
    });
  });
});
