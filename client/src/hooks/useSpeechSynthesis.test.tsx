import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useChatStore } from '@/stores/chatStore';
import { useSpeechSynthesis } from './useSpeechSynthesis';

function resetChatStore() {
  useChatStore.setState(useChatStore.getInitialState(), true);
}

class MockAudioElement {
  src = '';
  onplaying: (() => void) | null = null;
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  pause = vi.fn();
  load = vi.fn();
  removeAttribute = vi.fn();
  play = vi.fn(async () => {
    this.onplaying?.();
  });
}

let lastAudio: MockAudioElement;
const originalAudio = globalThis.Audio;

describe('useSpeechSynthesis (streaming audio element)', () => {
  beforeEach(() => {
    resetChatStore();
    useChatStore.setState({
      speechCapabilities: { stt: 'unavailable', tts: 'available' },
    });

    lastAudio = new MockAudioElement();
    globalThis.Audio = vi.fn(() => lastAudio) as unknown as typeof Audio;
  });

  afterEach(() => {
    globalThis.Audio = originalAudio;
    resetChatStore();
  });

  it('playMessage prepares URL and plays via audio element', async () => {
    const mockPrepare = vi.fn(async () => '/api/v1/speech/synthesize/stream/abc123');

    const { result } = renderHook(() =>
      useSpeechSynthesis({
        getMessageText: () => 'Test answer text',
        prepareFn: mockPrepare,
      }),
    );

    let playResult: boolean | undefined;
    await act(async () => {
      playResult = await result.current.playMessage('msg-1');
    });

    expect(playResult).toBe(true);
    expect(mockPrepare).toHaveBeenCalledWith(
      'Test answer text',
      undefined,
      expect.any(AbortSignal),
    );
    expect(globalThis.Audio).toHaveBeenCalledWith('/api/v1/speech/synthesize/stream/abc123');
    expect(lastAudio.play).toHaveBeenCalled();
    expect(useChatStore.getState().speechPlaybackState).toBe('playing');
    expect(useChatStore.getState().activePlaybackMessageId).toBe('msg-1');
  });

  it('playMessage toggles off when same message is playing', async () => {
    const mockPrepare = vi.fn(async () => '/stream/token');

    const { result } = renderHook(() =>
      useSpeechSynthesis({
        getMessageText: () => 'Answer',
        prepareFn: mockPrepare,
      }),
    );

    await act(async () => {
      await result.current.playMessage('msg-1');
    });

    let playResult: boolean | undefined;
    await act(async () => {
      playResult = await result.current.playMessage('msg-1');
    });

    expect(playResult).toBe(false);
    expect(useChatStore.getState().speechPlaybackState).toBe('stopped');
    expect(useChatStore.getState().activePlaybackMessageId).toBeNull();
  });

  it('playMessage stops previous before starting new', async () => {
    const mockPrepare = vi.fn(async () => '/stream/token');

    const { result } = renderHook(() =>
      useSpeechSynthesis({
        getMessageText: (id) => `Answer for ${id}`,
        prepareFn: mockPrepare,
      }),
    );

    await act(async () => {
      await result.current.playMessage('msg-a');
    });

    const firstAudio = lastAudio;
    lastAudio = new MockAudioElement();
    (globalThis.Audio as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      () => lastAudio,
    );

    await act(async () => {
      await result.current.playMessage('msg-b');
    });

    expect(firstAudio.pause).toHaveBeenCalled();
    expect(firstAudio.removeAttribute).toHaveBeenCalledWith('src');
    expect(firstAudio.load).toHaveBeenCalled();
    expect(useChatStore.getState().activePlaybackMessageId).toBe('msg-b');
  });

  it('stopPlayback pauses audio and resets store', async () => {
    const mockPrepare = vi.fn(async () => '/stream/token');

    const { result } = renderHook(() =>
      useSpeechSynthesis({
        getMessageText: () => 'Answer',
        prepareFn: mockPrepare,
      }),
    );

    await act(async () => {
      await result.current.playMessage('msg-1');
    });

    act(() => {
      result.current.stopPlayback();
    });

    expect(lastAudio.pause).toHaveBeenCalled();
    expect(lastAudio.removeAttribute).toHaveBeenCalledWith('src');
    expect(lastAudio.load).toHaveBeenCalled();
    expect(useChatStore.getState().speechPlaybackState).toBe('stopped');
    expect(useChatStore.getState().activePlaybackMessageId).toBeNull();
  });

  it('stopPlayback aborts in-flight prepare request', async () => {
    let capturedSignal: AbortSignal | undefined;
    const mockPrepare = vi.fn(async (_text: string, _voiceId?: string, signal?: AbortSignal) => {
      capturedSignal = signal;
      return '/stream/token';
    });

    const { result } = renderHook(() =>
      useSpeechSynthesis({
        getMessageText: () => 'Answer',
        prepareFn: mockPrepare,
      }),
    );

    await act(async () => {
      await result.current.playMessage('msg-1');
    });

    act(() => {
      result.current.stopPlayback();
    });

    expect(capturedSignal?.aborted).toBe(true);
  });

  it('playMessage shows error when prepare fails', async () => {
    const mockPrepare = vi.fn(async () => {
      throw new Error('Synthesis preparation failed: 503');
    });

    const { result } = renderHook(() =>
      useSpeechSynthesis({
        getMessageText: () => 'Answer',
        prepareFn: mockPrepare,
      }),
    );

    await act(async () => {
      await result.current.playMessage('msg-1');
    });

    await waitFor(() => {
      expect(useChatStore.getState().speechPlaybackState).toBe('error');
    });
    expect(useChatStore.getState().speechPlaybackErrorMessageId).toBe('msg-1');
  });

  it('audio onended resets store', async () => {
    const mockPrepare = vi.fn(async () => '/stream/token');

    const { result } = renderHook(() =>
      useSpeechSynthesis({
        getMessageText: () => 'Answer',
        prepareFn: mockPrepare,
      }),
    );

    await act(async () => {
      await result.current.playMessage('msg-1');
    });

    act(() => {
      lastAudio.onended?.();
    });

    expect(useChatStore.getState().speechPlaybackState).toBe('stopped');
    expect(useChatStore.getState().activePlaybackMessageId).toBeNull();
  });

  it('audio onerror sets error state', async () => {
    const mockPrepare = vi.fn(async () => '/stream/token');

    const { result } = renderHook(() =>
      useSpeechSynthesis({
        getMessageText: () => 'Answer',
        prepareFn: mockPrepare,
      }),
    );

    await act(async () => {
      await result.current.playMessage('msg-1');
    });

    act(() => {
      lastAudio.onerror?.();
    });

    expect(useChatStore.getState().speechPlaybackState).toBe('error');
    expect(useChatStore.getState().speechPlaybackErrorMessageId).toBe('msg-1');
  });

  it('cleanup stops playback', async () => {
    const mockPrepare = vi.fn(async () => '/stream/token');

    const { result } = renderHook(() =>
      useSpeechSynthesis({
        getMessageText: () => 'Answer',
        prepareFn: mockPrepare,
      }),
    );

    await act(async () => {
      await result.current.playMessage('msg-1');
    });

    act(() => {
      result.current.cleanup();
    });

    expect(lastAudio.pause).toHaveBeenCalled();
    expect(useChatStore.getState().speechPlaybackState).toBe('stopped');
  });

  it('ignores AbortError when prepare is cancelled', async () => {
    const mockPrepare = vi.fn(async () => {
      const err = new DOMException('The operation was aborted.', 'AbortError');
      throw err;
    });

    const { result } = renderHook(() =>
      useSpeechSynthesis({
        getMessageText: () => 'Answer',
        prepareFn: mockPrepare,
      }),
    );

    let playResult: boolean | undefined;
    await act(async () => {
      playResult = await result.current.playMessage('msg-1');
    });

    expect(playResult).toBe(false);
    // Should NOT set error state for abort
    expect(useChatStore.getState().speechPlaybackState).not.toBe('error');
  });

  it('shows error when audio.play() is rejected', async () => {
    const mockPrepare = vi.fn(async () => '/stream/token');
    lastAudio.play = vi.fn(async () => {
      throw new Error('play() not allowed');
    });

    const { result } = renderHook(() =>
      useSpeechSynthesis({
        getMessageText: () => 'Answer',
        prepareFn: mockPrepare,
      }),
    );

    await act(async () => {
      await result.current.playMessage('msg-1');
    });

    await waitFor(() => {
      expect(useChatStore.getState().speechPlaybackState).toBe('error');
    });
  });
});
