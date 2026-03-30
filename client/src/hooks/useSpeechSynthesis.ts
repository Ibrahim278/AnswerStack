import { useCallback, useEffect, useRef } from 'react';
import {
  buildSpeechErrorNotice,
  getPlainSpeechText,
} from '@/lib/speech';
import { synthesizeAudio } from '@/api/speech';
import { useChatStore } from '@/stores/chatStore';

interface UseSpeechSynthesisOptions {
  getMessageText: (messageId: string) => string;
  synthesizeFn?: (text: string, voiceId?: string, signal?: AbortSignal) => Promise<Blob>;
}

interface UseSpeechSynthesisResult {
  playMessage: (messageId: string) => Promise<boolean>;
  stopPlayback: () => void;
  cleanup: () => void;
}

export function useSpeechSynthesis({
  getMessageText,
  synthesizeFn,
}: UseSpeechSynthesisOptions): UseSpeechSynthesisResult {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const blobUrlRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const revokeCurrentUrl = useCallback(() => {
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }
  }, []);

  const stopPlayback = useCallback(() => {
    // Abort any in-flight fetch
    abortRef.current?.abort();
    abortRef.current = null;

    // Clean up audio element
    const audio = audioRef.current;
    if (audio) {
      audio.onplay = null;
      audio.onended = null;
      audio.onerror = null;
      audio.pause();
      audio.src = '';
      audioRef.current = null;
    }

    revokeCurrentUrl();
    useChatStore.getState().stopSpeechPlayback();
  }, [revokeCurrentUrl]);

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

      state.startSpeechPlayback(messageId);

      const text = getPlainSpeechText(getMessageText(messageId));
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const doSynthesize = synthesizeFn ?? synthesizeAudio;
        const blob = await doSynthesize(text, undefined, controller.signal);

        // Stale response guard: check if we're still playing this message
        if (useChatStore.getState().activePlaybackMessageId !== messageId) {
          return false;
        }

        const url = URL.createObjectURL(blob);
        blobUrlRef.current = url;

        const audio = new Audio(url);
        audioRef.current = audio;

        audio.onplay = () => {
          useChatStore.getState().setSpeechPlaying(messageId);
        };

        audio.onended = () => {
          revokeCurrentUrl();
          audioRef.current = null;
          useChatStore.getState().stopSpeechPlayback();
        };

        audio.onerror = () => {
          revokeCurrentUrl();
          audioRef.current = null;
          useChatStore.getState().setSpeechPlaybackError(
            messageId,
            buildSpeechErrorNotice('playback-interrupted', 'playback'),
          );
        };

        try {
          await audio.play();
        } catch (playError: unknown) {
          // Ignore AbortError (user cancelled)
          if (
            typeof playError === 'object' &&
            playError &&
            'name' in playError &&
            playError.name === 'AbortError'
          ) {
            return false;
          }

          useChatStore.getState().setSpeechPlaybackError(
            messageId,
            buildSpeechErrorNotice('playback-blocked', 'playback'),
          );
          return false;
        }

        return true;
      } catch (error: unknown) {
        // Ignore AbortError from AbortController
        if (
          typeof error === 'object' &&
          error &&
          'name' in error &&
          error.name === 'AbortError'
        ) {
          return false;
        }

        useChatStore.getState().setSpeechPlaybackError(
          messageId,
          buildSpeechErrorNotice('network', 'playback'),
        );
        return false;
      }
    },
    [getMessageText, revokeCurrentUrl, stopPlayback, synthesizeFn],
  );

  return {
    playMessage,
    stopPlayback,
    cleanup,
  };
}
