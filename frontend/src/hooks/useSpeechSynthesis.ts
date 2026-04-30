import { useCallback, useEffect, useRef } from 'react';
import {
  buildSpeechErrorNotice,
  getPlainSpeechText,
} from '@/lib/speech';
import { prepareSynthesisUrl } from '@/api/speech';
import { useChatStore } from '@/stores/chatStore';

interface UseSpeechSynthesisOptions {
  getMessageText: (messageId: string) => string;
  prepareFn?: (text: string, voiceId?: string, signal?: AbortSignal) => Promise<string>;
}

interface UseSpeechSynthesisResult {
  playMessage: (messageId: string) => Promise<boolean>;
  stopPlayback: () => void;
  cleanup: () => void;
}

export function useSpeechSynthesis({
  getMessageText,
  prepareFn,
}: UseSpeechSynthesisOptions): UseSpeechSynthesisResult {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const playbackSessionRef = useRef(0);

  const stopPlayback = useCallback(() => {
    playbackSessionRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;

    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
      audioRef.current = null;
    }

    useChatStore.getState().stopSpeechPlayback();
  }, []);

  const cleanup = useCallback(() => {
    stopPlayback();
  }, [stopPlayback]);

  useEffect(() => cleanup, [cleanup]);

  const playMessage = useCallback(
    async (messageId: string): Promise<boolean> => {
      const state = useChatStore.getState();
      const { activePlaybackMessageId } = state;

      // Toggle off if same message
      if (activePlaybackMessageId === messageId) {
        stopPlayback();
        return false;
      }

      // Stop any current playback
      if (activePlaybackMessageId) {
        stopPlayback();
      }

      playbackSessionRef.current += 1;
      const sessionId = playbackSessionRef.current;
      state.startSpeechPlayback(messageId);

      const text = getPlainSpeechText(getMessageText(messageId));
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const doPrepare = prepareFn ?? prepareSynthesisUrl;
        const url = await doPrepare(text, undefined, controller.signal);

        if (
          playbackSessionRef.current !== sessionId ||
          useChatStore.getState().activePlaybackMessageId !== messageId
        ) {
          return false;
        }

        const audio = new Audio(url);
        audioRef.current = audio;

        audio.onplaying = () => {
          if (playbackSessionRef.current === sessionId) {
            useChatStore.getState().setSpeechPlaying(messageId);
          }
        };

        audio.onended = () => {
          if (audioRef.current === audio) {
            audioRef.current = null;
            useChatStore.getState().stopSpeechPlayback();
          }
        };

        audio.onerror = () => {
          if (
            playbackSessionRef.current === sessionId &&
            useChatStore.getState().activePlaybackMessageId === messageId
          ) {
            audioRef.current = null;
            useChatStore.getState().setSpeechPlaybackError(
              messageId,
              buildSpeechErrorNotice('network', 'playback'),
            );
          }
        };

        await audio.play();
        return true;
      } catch (error: unknown) {
        if (
          typeof error === 'object' &&
          error &&
          'name' in error &&
          error.name === 'AbortError'
        ) {
          return false;
        }

        const isActiveSession =
          playbackSessionRef.current === sessionId &&
          useChatStore.getState().activePlaybackMessageId === messageId;
        if (isActiveSession) {
          useChatStore.getState().setSpeechPlaybackError(
            messageId,
            buildSpeechErrorNotice('network', 'playback'),
          );
        }
        return false;
      }
    },
    [getMessageText, stopPlayback, prepareFn],
  );

  return {
    playMessage,
    stopPlayback,
    cleanup,
  };
}
