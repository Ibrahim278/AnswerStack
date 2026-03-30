import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useChatStore } from '@/stores/chatStore';
import { useSpeechSynthesis } from './useSpeechSynthesis';

function resetChatStore() {
  useChatStore.setState(useChatStore.getInitialState(), true);
}

class FakeUtterance {
  text: string;
  voice: SpeechSynthesisVoice | null = null;
  onstart: ((event: Event) => void) | null = null;
  onend: ((event: Event) => void) | null = null;
  onerror: ((event: Event & { error?: string }) => void) | null = null;

  constructor(text: string) {
    this.text = text;
  }
}

function createMockSynth() {
  const spoken: FakeUtterance[] = [];

  return {
    synth: {
      cancel: vi.fn(),
      getVoices: vi.fn(() => []),
      speak: vi.fn((utterance: FakeUtterance) => {
        spoken.push(utterance);
      }),
    },
    spoken,
  };
}

describe('useSpeechSynthesis', () => {
  beforeEach(() => {
    resetChatStore();
  });

  it('cancels message A before starting message B', () => {
    const { synth, spoken } = createMockSynth();
    const getMessageText = (messageId: string) =>
      messageId === 'a' ? '**Answer** [Source 1]' : 'Second answer';

    const { result } = renderHook(() =>
      useSpeechSynthesis({
        getMessageText,
        synth,
        UtteranceCtor: FakeUtterance as unknown as typeof SpeechSynthesisUtterance,
      }),
    );

    act(() => {
      result.current.playMessage('a');
    });

    expect(spoken[0]?.text).toBe('Answer');

    act(() => {
      spoken[0]?.onstart?.(new Event('start'));
      result.current.playMessage('b');
    });

    expect(synth.cancel).toHaveBeenCalledTimes(1);
    expect(useChatStore.getState().activePlaybackMessageId).toBe('b');
  });

  it('stops playback when the active message is replayed', () => {
    const { synth, spoken } = createMockSynth();

    const { result } = renderHook(() =>
      useSpeechSynthesis({
        getMessageText: () => 'Answer',
        synth,
        UtteranceCtor: FakeUtterance as unknown as typeof SpeechSynthesisUtterance,
      }),
    );

    act(() => {
      result.current.playMessage('answer-1');
      spoken[0]?.onstart?.(new Event('start'));
    });

    act(() => {
      result.current.playMessage('answer-1');
    });

    expect(synth.cancel).toHaveBeenCalledTimes(1);
    expect(useChatStore.getState().speechPlaybackState).toBe('stopped');
    expect(useChatStore.getState().activePlaybackMessageId).toBeNull();
  });

  it('cancels synthesis during cleanup', () => {
    const { synth } = createMockSynth();

    const { result } = renderHook(() =>
      useSpeechSynthesis({
        getMessageText: () => 'Answer',
        synth,
        UtteranceCtor: FakeUtterance as unknown as typeof SpeechSynthesisUtterance,
      }),
    );

    act(() => {
      result.current.playMessage('answer-1');
      result.current.cleanup();
    });

    expect(synth.cancel).toHaveBeenCalledTimes(1);
    expect(useChatStore.getState().speechPlaybackState).toBe('stopped');
    expect(useChatStore.getState().activeSpeechMode).toBe('none');
  });

  it('maps synthesis errors to playback-blocked and playback-interrupted notices', () => {
    const { synth, spoken } = createMockSynth();

    const { result } = renderHook(() =>
      useSpeechSynthesis({
        getMessageText: () => 'Answer',
        synth,
        UtteranceCtor: FakeUtterance as unknown as typeof SpeechSynthesisUtterance,
      }),
    );

    act(() => {
      result.current.playMessage('answer-1');
      spoken[0]?.onerror?.({ error: 'not-allowed' } as Event & { error?: string });
    });

    expect(useChatStore.getState().speechError?.code).toBe('playback-blocked');
    expect(useChatStore.getState().speechPlaybackErrorMessageId).toBe('answer-1');

    act(() => {
      result.current.playMessage('answer-2');
      spoken[1]?.onerror?.({ error: 'interrupted' } as Event & { error?: string });
    });

    expect(useChatStore.getState().speechError?.code).toBe('playback-interrupted');
    expect(useChatStore.getState().speechPlaybackErrorMessageId).toBe('answer-2');
  });
});
