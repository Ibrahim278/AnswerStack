import { useCallback, useEffect, useRef } from 'react';
import {
  buildSpeechErrorNotice,
  getPlainSpeechText,
  resolveSpeechSynthesisVoice,
} from '@/lib/speech';
import { useChatStore } from '@/stores/chatStore';
import type { SpeechSynthesisLike } from '@/types/speech';

interface UseSpeechSynthesisOptions {
  getMessageText: (messageId: string) => string;
  synth?: SpeechSynthesisLike;
  UtteranceCtor?: typeof SpeechSynthesisUtterance;
}

interface SpeechSynthesisEventLike extends Event {
  error?: string;
}

interface UseSpeechSynthesisResult {
  playMessage: (messageId: string) => boolean;
  stopPlayback: () => void;
  cleanup: () => void;
}

function normalizePlaybackError(kind?: string) {
  switch (kind) {
    case 'not-allowed':
    case 'service-not-allowed':
      return 'playback-blocked';
    case 'interrupted':
    case 'canceled':
    case 'cancelled':
    case 'aborted':
      return 'playback-interrupted';
    default:
      return kind ?? 'unknown';
  }
}

export function useSpeechSynthesis({
  getMessageText,
  synth = typeof window !== 'undefined' ? window.speechSynthesis : undefined,
  UtteranceCtor = typeof window !== 'undefined' ? window.SpeechSynthesisUtterance : undefined,
}: UseSpeechSynthesisOptions): UseSpeechSynthesisResult {
  const lastVoiceUriRef = useRef<string | null>(null);

  const stopPlayback = useCallback(() => {
    synth?.cancel();
    useChatStore.getState().stopSpeechPlayback();
  }, [synth]);

  const cleanup = useCallback(() => {
    stopPlayback();
  }, [stopPlayback]);

  useEffect(() => cleanup, [cleanup]);

  const playMessage = useCallback(
    (messageId: string) => {
      const state = useChatStore.getState();
      const { activePlaybackMessageId } = state;

      if (activePlaybackMessageId === messageId) {
        stopPlayback();
        return false;
      }

      if (!synth || !UtteranceCtor) {
        state.setSpeechPlaybackError(messageId, buildSpeechErrorNotice('not-supported', 'playback'));
        return false;
      }

      if (activePlaybackMessageId) {
        synth.cancel();
      }

      const text = getPlainSpeechText(getMessageText(messageId));
      const utterance = new UtteranceCtor(text);
      const { voice } = resolveSpeechSynthesisVoice(synth, lastVoiceUriRef.current);

      if (voice) {
        utterance.voice = voice;
        lastVoiceUriRef.current = voice.voiceURI;
      } else {
        lastVoiceUriRef.current = null;
      }

      utterance.onstart = () => {
        state.setSpeechPlaying(messageId);
      };

      utterance.onend = () => {
        if (useChatStore.getState().activePlaybackMessageId === messageId) {
          state.stopSpeechPlayback();
        }
      };

      utterance.onerror = (event: SpeechSynthesisEventLike) => {
        state.setSpeechPlaybackError(
          messageId,
          buildSpeechErrorNotice(normalizePlaybackError(event.error), 'playback'),
        );
      };

      state.startSpeechPlayback(messageId);

      try {
        synth.speak(utterance);
        return true;
      } catch (error) {
        const normalizedError =
          typeof error === 'object' &&
          error &&
          'name' in error &&
          (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError')
            ? 'playback-blocked'
            : 'unknown';

        state.setSpeechPlaybackError(
          messageId,
          buildSpeechErrorNotice(normalizedError, 'playback'),
        );
        return false;
      }
    },
    [UtteranceCtor, getMessageText, stopPlayback, synth],
  );

  return {
    playMessage,
    stopPlayback,
    cleanup,
  };
}
