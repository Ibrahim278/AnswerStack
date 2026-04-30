import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as speechLib from '@/lib/speech';
import { useChatStore } from '@/stores/chatStore';
import type { AudioCapture, AudioCaptureResult } from '@/lib/audioCapture';
import type { MicrophonePermissionState } from '@/types/speech';
import { useSpeechRecognition } from './useSpeechRecognition';

function resetChatStore() {
  useChatStore.setState(useChatStore.getInitialState(), true);
}

function createMockStream(): MediaStream {
  const stopFn = vi.fn();
  return {
    getTracks: () => [{ stop: stopFn, kind: 'audio', id: 'track-1' }],
  } as unknown as MediaStream;
}

/** Create an audio blob large enough to pass the MIN_BLOB_SIZE threshold (100 bytes). */
function createLargeBlob(): Blob {
  return new Blob([new Uint8Array(200)], { type: 'audio/webm' });
}

function createMockCapture(overrides?: Partial<AudioCapture>): AudioCapture {
  let active = false;

  return {
    start: vi.fn(() => {
      active = true;
    }),
    stop: vi.fn(
      () =>
        new Promise<AudioCaptureResult>((resolve) => {
          active = false;
          resolve({
            blob: createLargeBlob(),
            mimeType: 'audio/webm',
            durationMs: 1500,
          });
        }),
    ),
    cancel: vi.fn(() => {
      active = false;
    }),
    isActive: vi.fn(() => active),
    ...overrides,
  };
}

describe('useSpeechRecognition (backend-proxied)', () => {
  beforeEach(() => {
    resetChatStore();
    useChatStore.setState({
      speechCapabilities: { stt: 'available', tts: 'unavailable' },
      speechRecognitionState: 'idle',
    });
    vi.restoreAllMocks();
    vi.spyOn(speechLib, 'watchMicrophonePermission').mockResolvedValue(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    resetChatStore();
  });

  it('startCapture returns true and transitions to listening on success', async () => {
    const mockStream = createMockStream();
    const mockCapture = createMockCapture();
    const onStart = vi.fn();

    const { result } = renderHook(() =>
      useSpeechRecognition({
        value: 'Prefix: ',
        onInterimText: vi.fn(),
        onCommit: vi.fn(),
        onCancel: vi.fn(),
        onStart,
        getUserMediaFn: async () => mockStream,
        createCaptureFn: () => mockCapture,
        transcribeFn: async () => ({ text: 'hello' }),
        queryPermission: async () => 'granted',
      }),
    );

    let started: boolean | undefined;
    await act(async () => {
      started = await result.current.startCapture();
    });

    expect(started).toBe(true);
    expect(mockCapture.start).toHaveBeenCalledTimes(1);
    expect(onStart).toHaveBeenCalledTimes(1);
    expect(useChatStore.getState().speechRecognitionState).toBe('listening');
  });

  it('startCapture returns false and shows error on permission denied (getUserMedia rejects)', async () => {
    const onCancel = vi.fn();

    const { result } = renderHook(() =>
      useSpeechRecognition({
        value: 'My question',
        onInterimText: vi.fn(),
        onCommit: vi.fn(),
        onCancel,
        getUserMediaFn: async () => {
          const err = new DOMException('Permission denied', 'NotAllowedError');
          throw err;
        },
        createCaptureFn: () => createMockCapture(),
        queryPermission: async () => 'granted',
      }),
    );

    let started: boolean | undefined;
    await act(async () => {
      started = await result.current.startCapture();
    });

    expect(started).toBe(false);
    expect(onCancel).toHaveBeenCalledWith('My question');
    expect(useChatStore.getState().speechError?.code).toBe('not-allowed');
  });

  it('commitCapture sends audio to transcribeAudio and commits transcript', async () => {
    const mockStream = createMockStream();
    const mockCapture = createMockCapture();
    const onCommit = vi.fn();
    const transcribeFn = vi.fn(async () => ({ text: 'Hello world' }));

    const { result } = renderHook(() =>
      useSpeechRecognition({
        value: 'Existing: ',
        onInterimText: vi.fn(),
        onCommit,
        onCancel: vi.fn(),
        getUserMediaFn: async () => mockStream,
        createCaptureFn: () => mockCapture,
        transcribeFn,
        queryPermission: async () => 'granted',
      }),
    );

    await act(async () => {
      await result.current.startCapture();
    });

    await act(async () => {
      await result.current.commitCapture();
    });

    expect(mockCapture.stop).toHaveBeenCalledTimes(1);
    expect(transcribeFn).toHaveBeenCalledWith(
      expect.any(Blob),
      'audio/webm',
      'en',
    );
    expect(onCommit).toHaveBeenCalledWith('Existing: Hello world');
    expect(useChatStore.getState().speechRecognitionState).toBe('idle');
  });

  it('commitCapture shows no-speech error for tiny blob', async () => {
    const mockStream = createMockStream();
    const tinyCapture = createMockCapture({
      stop: vi.fn(
        () =>
          new Promise<AudioCaptureResult>((resolve) => {
            resolve({
              blob: new Blob([], { type: 'audio/webm' }),
              mimeType: 'audio/webm',
              durationMs: 100,
            });
          }),
      ),
    });
    const onCancel = vi.fn();

    const { result } = renderHook(() =>
      useSpeechRecognition({
        value: 'Draft',
        onInterimText: vi.fn(),
        onCommit: vi.fn(),
        onCancel,
        getUserMediaFn: async () => mockStream,
        createCaptureFn: () => tinyCapture,
        transcribeFn: async () => ({ text: '' }),
        queryPermission: async () => 'granted',
      }),
    );

    await act(async () => {
      await result.current.startCapture();
    });

    await act(async () => {
      await result.current.commitCapture();
    });

    expect(useChatStore.getState().speechError?.code).toBe('no-speech');
    expect(onCancel).toHaveBeenCalledWith('Draft');
  });

  it('commitCapture shows network error when transcription fails', async () => {
    const mockStream = createMockStream();
    const mockCapture = createMockCapture();
    const onCancel = vi.fn();

    const { result } = renderHook(() =>
      useSpeechRecognition({
        value: 'Question',
        onInterimText: vi.fn(),
        onCommit: vi.fn(),
        onCancel,
        getUserMediaFn: async () => mockStream,
        createCaptureFn: () => mockCapture,
        transcribeFn: async () => {
          throw new Error('Network error');
        },
        queryPermission: async () => 'granted',
      }),
    );

    await act(async () => {
      await result.current.startCapture();
    });

    await act(async () => {
      await result.current.commitCapture();
    });

    expect(useChatStore.getState().speechError?.code).toBe('network');
    expect(onCancel).toHaveBeenCalledWith('Question');
  });

  it('cancelCapture stops recorder and restores composer text', async () => {
    const mockStream = createMockStream();
    const mockCapture = createMockCapture();
    const onCancel = vi.fn();

    const { result } = renderHook(() =>
      useSpeechRecognition({
        value: 'Restore me',
        onInterimText: vi.fn(),
        onCommit: vi.fn(),
        onCancel,
        getUserMediaFn: async () => mockStream,
        createCaptureFn: () => mockCapture,
        queryPermission: async () => 'granted',
      }),
    );

    await act(async () => {
      await result.current.startCapture();
    });

    act(() => {
      result.current.cancelCapture();
    });

    expect(mockCapture.cancel).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledWith('Restore me');
    expect(useChatStore.getState().speechDraft).toBe('');
    expect(useChatStore.getState().speechRecognitionState).toBe('idle');
  });

  it('cleanup releases media stream tracks', async () => {
    const mockStream = createMockStream();
    const mockCapture = createMockCapture();

    const { result } = renderHook(() =>
      useSpeechRecognition({
        value: '',
        onInterimText: vi.fn(),
        onCommit: vi.fn(),
        onCancel: vi.fn(),
        getUserMediaFn: async () => mockStream,
        createCaptureFn: () => mockCapture,
        queryPermission: async () => 'granted',
      }),
    );

    await act(async () => {
      await result.current.startCapture();
    });

    act(() => {
      result.current.cleanup();
    });

    expect(mockCapture.cancel).toHaveBeenCalledTimes(1);
  });

  it('startCapture with audio-capture error maps correctly', async () => {
    const onCancel = vi.fn();

    const { result } = renderHook(() =>
      useSpeechRecognition({
        value: '',
        onInterimText: vi.fn(),
        onCommit: vi.fn(),
        onCancel,
        getUserMediaFn: async () => {
          const err = new DOMException('No audio device', 'NotFoundError');
          throw err;
        },
        createCaptureFn: () => createMockCapture(),
        queryPermission: async () => 'granted',
      }),
    );

    let started: boolean | undefined;
    await act(async () => {
      started = await result.current.startCapture();
    });

    expect(started).toBe(false);
    expect(useChatStore.getState().speechError?.code).toBe('audio-capture');
  });

  it('downgrades to denied and cancels active capture when permission is revoked', async () => {
    const mockStream = createMockStream();
    const mockCapture = createMockCapture();
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
        getUserMediaFn: async () => mockStream,
        createCaptureFn: () => mockCapture,
        queryPermission: async () => 'granted',
      }),
    );

    await act(async () => {
      await result.current.startCapture();
    });

    act(() => {
      watcher?.('denied');
    });

    expect(mockCapture.cancel).toHaveBeenCalledTimes(1);
    expect(useChatStore.getState().microphonePermission).toBe('denied');
    expect(useChatStore.getState().speechError?.code).toBe('not-allowed');
    expect(onCancel).toHaveBeenCalledWith('Restore me');
  });

  it('surfaces pending permission state while getUserMedia is still awaiting approval', async () => {
    vi.useFakeTimers();
    let resolveGetUserMedia: ((stream: MediaStream) => void) | undefined;

    const { result } = renderHook(() =>
      useSpeechRecognition({
        value: 'Question',
        onInterimText: vi.fn(),
        onCommit: vi.fn(),
        onCancel: vi.fn(),
        getUserMediaFn: () =>
          new Promise<MediaStream>((resolve) => {
            resolveGetUserMedia = resolve;
          }),
        createCaptureFn: () => createMockCapture(),
        queryPermission: async () => 'prompt',
      }),
    );

    const startPromise = result.current.startCapture();

    await act(async () => {
      await Promise.resolve();
      vi.advanceTimersByTime(4_000);
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(useChatStore.getState().microphonePermission).toBe('pending');
    expect(useChatStore.getState().speechRecognitionState).toBe('arming');

    act(() => {
      result.current.cancelCapture();
    });

    await act(async () => {
      resolveGetUserMedia?.(createMockStream());
      await startPromise;
    });
  });

  it('does not continue into listening after capture is cancelled while getUserMedia is still pending', async () => {
    let resolveGetUserMedia: ((stream: MediaStream) => void) | undefined;
    const stream = createMockStream();
    const getUserMediaFn = vi.fn(
      () =>
        new Promise<MediaStream>((resolve) => {
          resolveGetUserMedia = resolve;
        }),
    );

    const { result } = renderHook(() =>
      useSpeechRecognition({
        value: 'Question',
        onInterimText: vi.fn(),
        onCommit: vi.fn(),
        onCancel: vi.fn(),
        getUserMediaFn,
        createCaptureFn: () => createMockCapture(),
        queryPermission: async () => 'granted',
      }),
    );

    const startPromise = result.current.startCapture();

    await act(async () => {
      await Promise.resolve();
    });

    act(() => {
      result.current.cancelCapture();
    });

    await act(async () => {
      resolveGetUserMedia?.(stream);
      await startPromise;
    });

    expect(useChatStore.getState().speechRecognitionState).toBe('idle');
    expect(getUserMediaFn).toHaveBeenCalledTimes(1);
  });

  it('60-second timeout auto-commits recording', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const mockStream = createMockStream();
    const mockCapture = createMockCapture();
    const onCommit = vi.fn();
    const transcribeFn = vi.fn(async () => ({ text: 'timeout result' }));

    const { result } = renderHook(() =>
      useSpeechRecognition({
        value: '',
        onInterimText: vi.fn(),
        onCommit,
        onCancel: vi.fn(),
        getUserMediaFn: async () => mockStream,
        createCaptureFn: () => mockCapture,
        transcribeFn,
        queryPermission: async () => 'granted',
      }),
    );

    await act(async () => {
      await result.current.startCapture();
    });

    // Advance timer to 60 seconds to trigger the timeout
    await act(async () => {
      vi.advanceTimersByTime(60_000);
      // Allow microtasks to process
      await vi.advanceTimersByTimeAsync(0);
    });

    // Wait for the async commitCapture chain to complete
    await waitFor(() => {
      expect(transcribeFn).toHaveBeenCalled();
    });

    expect(onCommit).toHaveBeenCalledWith('timeout result');

    vi.useRealTimers();
  });
});
