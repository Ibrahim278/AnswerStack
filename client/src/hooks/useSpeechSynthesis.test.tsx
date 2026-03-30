import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useChatStore } from '@/stores/chatStore';
import { useSpeechSynthesis } from './useSpeechSynthesis';

function resetChatStore() {
  useChatStore.setState(useChatStore.getInitialState(), true);
}

// Mock Audio element
class MockAudio {
  src = '';
  onplay: (() => void) | null = null;
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  play = vi.fn(async () => {
    this.onplay?.();
  });
  pause = vi.fn();
}

describe('useSpeechSynthesis (backend-proxied)', () => {
  let originalAudio: typeof Audio;
  let lastAudio: MockAudio;
  let originalCreateObjectURL: typeof URL.createObjectURL;
  let originalRevokeObjectURL: typeof URL.revokeObjectURL;

  beforeEach(() => {
    resetChatStore();
    useChatStore.setState({
      speechCapabilities: { stt: 'unavailable', tts: 'available' },
    });

    // Mock Audio constructor
    originalAudio = globalThis.Audio;
    lastAudio = new MockAudio();
    globalThis.Audio = vi.fn(() => lastAudio) as unknown as typeof Audio;

    // Mock URL methods
    originalCreateObjectURL = URL.createObjectURL;
    originalRevokeObjectURL = URL.revokeObjectURL;
    URL.createObjectURL = vi.fn(() => 'blob:mock-url');
    URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    globalThis.Audio = originalAudio;
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
    resetChatStore();
  });

  it('playMessage fetches audio and plays via Audio element', async () => {
    const mockSynthesize = vi.fn(async () =>
      new Blob(['fake-audio'], { type: 'audio/mpeg' }),
    );

    const { result } = renderHook(() =>
      useSpeechSynthesis({
        getMessageText: () => 'Test answer text',
        synthesizeFn: mockSynthesize,
      }),
    );

    let playResult: boolean | undefined;
    await act(async () => {
      playResult = await result.current.playMessage('msg-1');
    });

    expect(playResult).toBe(true);
    expect(mockSynthesize).toHaveBeenCalledWith(
      'Test answer text',
      undefined,
      expect.any(AbortSignal),
    );
    expect(URL.createObjectURL).toHaveBeenCalled();
    expect(lastAudio.play).toHaveBeenCalled();
    expect(useChatStore.getState().speechPlaybackState).toBe('playing');
    expect(useChatStore.getState().activePlaybackMessageId).toBe('msg-1');
  });

  it('playMessage toggles off when same message is playing', async () => {
    const mockSynthesize = vi.fn(async () =>
      new Blob(['fake-audio'], { type: 'audio/mpeg' }),
    );

    const { result } = renderHook(() =>
      useSpeechSynthesis({
        getMessageText: () => 'Answer',
        synthesizeFn: mockSynthesize,
      }),
    );

    // Play first
    await act(async () => {
      await result.current.playMessage('msg-1');
    });

    // Toggle off
    let playResult: boolean | undefined;
    await act(async () => {
      playResult = await result.current.playMessage('msg-1');
    });

    expect(playResult).toBe(false);
    expect(useChatStore.getState().speechPlaybackState).toBe('stopped');
    expect(useChatStore.getState().activePlaybackMessageId).toBeNull();
  });

  it('playMessage stops previous before starting new', async () => {
    const mockSynthesize = vi.fn(async () =>
      new Blob(['fake-audio'], { type: 'audio/mpeg' }),
    );

    const { result } = renderHook(() =>
      useSpeechSynthesis({
        getMessageText: (id) => `Answer for ${id}`,
        synthesizeFn: mockSynthesize,
      }),
    );

    // Play message A
    await act(async () => {
      await result.current.playMessage('msg-a');
    });

    const firstAudio = lastAudio;
    lastAudio = new MockAudio();
    (globalThis.Audio as ReturnType<typeof vi.fn>).mockReturnValue(lastAudio);

    // Play message B -- should stop A first
    await act(async () => {
      await result.current.playMessage('msg-b');
    });

    expect(firstAudio.pause).toHaveBeenCalled();
    expect(URL.revokeObjectURL).toHaveBeenCalled();
    expect(useChatStore.getState().activePlaybackMessageId).toBe('msg-b');
  });

  it('stopPlayback pauses audio and revokes blob URL', async () => {
    const mockSynthesize = vi.fn(async () =>
      new Blob(['fake-audio'], { type: 'audio/mpeg' }),
    );

    const { result } = renderHook(() =>
      useSpeechSynthesis({
        getMessageText: () => 'Answer',
        synthesizeFn: mockSynthesize,
      }),
    );

    await act(async () => {
      await result.current.playMessage('msg-1');
    });

    act(() => {
      result.current.stopPlayback();
    });

    expect(lastAudio.pause).toHaveBeenCalled();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
    expect(useChatStore.getState().speechPlaybackState).toBe('stopped');
    expect(useChatStore.getState().activePlaybackMessageId).toBeNull();
  });

  it('stopPlayback aborts in-flight fetch', async () => {
    let capturedSignal: AbortSignal | undefined;
    const mockSynthesize = vi.fn(async (_text: string, _voiceId?: string, signal?: AbortSignal) => {
      capturedSignal = signal;
      // Simulate a slow response
      return new Blob(['fake-audio'], { type: 'audio/mpeg' });
    });

    const { result } = renderHook(() =>
      useSpeechSynthesis({
        getMessageText: () => 'Answer',
        synthesizeFn: mockSynthesize,
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

  it('playMessage shows error when synthesis fails', async () => {
    const mockSynthesize = vi.fn(async () => {
      throw new Error('Synthesis failed: 503');
    });

    const { result } = renderHook(() =>
      useSpeechSynthesis({
        getMessageText: () => 'Answer',
        synthesizeFn: mockSynthesize,
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

  it('cleanup stops playback', async () => {
    const mockSynthesize = vi.fn(async () =>
      new Blob(['fake-audio'], { type: 'audio/mpeg' }),
    );

    const { result } = renderHook(() =>
      useSpeechSynthesis({
        getMessageText: () => 'Answer',
        synthesizeFn: mockSynthesize,
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
    expect(useChatStore.getState().activeSpeechMode).toBe('none');
  });

  it('onended cleans up blob URL and resets store', async () => {
    const mockSynthesize = vi.fn(async () =>
      new Blob(['fake-audio'], { type: 'audio/mpeg' }),
    );

    const { result } = renderHook(() =>
      useSpeechSynthesis({
        getMessageText: () => 'Answer',
        synthesizeFn: mockSynthesize,
      }),
    );

    await act(async () => {
      await result.current.playMessage('msg-1');
    });

    // Simulate audio ended
    act(() => {
      lastAudio.onended?.();
    });

    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
    expect(useChatStore.getState().speechPlaybackState).toBe('stopped');
    expect(useChatStore.getState().activePlaybackMessageId).toBeNull();
  });
});
