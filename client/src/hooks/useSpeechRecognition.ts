import { useCallback, useEffect, useRef } from 'react';
import {
  buildSpeechErrorNotice,
  getSpeechRecognitionCtor,
  queryMicrophonePermission,
  requestMicrophonePreflight,
  watchMicrophonePermission,
} from '@/lib/speech';
import { useChatStore } from '@/stores/chatStore';
import type {
  MicrophonePermissionState,
  MicrophonePreflightResult,
  SpeechErrorNotice,
  SpeechRecognitionErrorEventLike,
  SpeechRecognitionEventLike,
  SpeechRecognitionLike,
} from '@/types/speech';

interface UseSpeechRecognitionOptions {
  value: string;
  onInterimText: (nextValue: string) => void;
  onCommit: (finalValue: string) => void;
  onCancel: (restoreValue: string) => void;
  onStart?: () => void;
  recognitionFactory?: () => SpeechRecognitionLike | null;
  queryPermission?: () => Promise<MicrophonePermissionState>;
  requestPreflight?: () => Promise<MicrophonePreflightResult>;
}

interface UseSpeechRecognitionResult {
  startCapture: () => Promise<boolean>;
  commitCapture: () => void;
  cancelCapture: () => void;
  cleanup: () => void;
}

function normalizeStartError(error: unknown): SpeechErrorNotice {
  if (
    typeof error === 'object' &&
    error &&
    'name' in error &&
    (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError')
  ) {
    return buildSpeechErrorNotice('not-allowed');
  }

  return buildSpeechErrorNotice('unknown');
}

function getEventTranscript(event: SpeechRecognitionEventLike) {
  let transcript = '';

  for (let index = event.resultIndex; index < event.results.length; index += 1) {
    transcript += event.results[index]?.[0]?.transcript ?? '';
  }

  return transcript;
}

export function useSpeechRecognition({
  value,
  onInterimText,
  onCommit,
  onCancel,
  onStart,
  recognitionFactory,
  queryPermission = queryMicrophonePermission,
  requestPreflight = requestMicrophonePreflight,
}: UseSpeechRecognitionOptions): UseSpeechRecognitionResult {
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const permissionCleanupRef = useRef<() => void>(() => {});
  const committedPrefixRef = useRef('');
  const latestTranscriptRef = useRef('');
  const suppressNextErrorRef = useRef(false);
  const hadPermissionSuccessRef = useRef(false);

  const cleanupStoreState = useCallback(() => {
    const state = useChatStore.getState();
    useChatStore.setState({
      speechRecognitionState:
        state.speechCapabilities.stt === 'available' ? 'idle' : 'unsupported',
      speechDraft: '',
      speechCommittedPrefix: '',
      speechError: null,
      activeSpeechMode:
        state.activeSpeechMode === 'recording' ? 'none' : state.activeSpeechMode,
    });
  }, []);

  const cancelActiveRecognition = useCallback(() => {
    const recognition = recognitionRef.current;
    if (!recognition) {
      return;
    }

    suppressNextErrorRef.current = true;
    recognition.abort();
    recognitionRef.current = null;
  }, []);

  const handlePermissionChange = useCallback(
    (nextPermission: MicrophonePermissionState) => {
      const state = useChatStore.getState();
      state.setMicrophonePermission(nextPermission);

      if (nextPermission === 'granted') {
        hadPermissionSuccessRef.current = true;
        return;
      }

      if (nextPermission !== 'denied' || !hadPermissionSuccessRef.current) {
        return;
      }

      cancelActiveRecognition();
      state.cancelSpeechCapture();
      onCancel(committedPrefixRef.current);
      state.setSpeechRecognitionError(buildSpeechErrorNotice('not-allowed'));
    },
    [cancelActiveRecognition, onCancel],
  );

  const cleanup = useCallback(() => {
    permissionCleanupRef.current();
    permissionCleanupRef.current = () => {};
    cancelActiveRecognition();
    latestTranscriptRef.current = '';
    cleanupStoreState();
  }, [cancelActiveRecognition, cleanupStoreState]);

  useEffect(() => {
    let cancelled = false;

    void watchMicrophonePermission(handlePermissionChange).then((unsubscribe) => {
      if (cancelled) {
        unsubscribe();
        return;
      }

      permissionCleanupRef.current = unsubscribe;
    });

    return () => {
      cancelled = true;
      cleanup();
    };
  }, [cleanup, handlePermissionChange]);

  const startCapture = useCallback(async () => {
    const state = useChatStore.getState();
    const createRecognition =
      recognitionFactory ??
      (() => {
        const RecognitionCtor = getSpeechRecognitionCtor();
        return RecognitionCtor ? new RecognitionCtor() : null;
      });

    const recognition = createRecognition();
    committedPrefixRef.current = value;
    latestTranscriptRef.current = '';
    suppressNextErrorRef.current = false;

    if (!recognition) {
      state.setMicrophonePermission('unsupported');
      state.setSpeechRecognitionError(buildSpeechErrorNotice('not-supported'));
      return false;
    }

    state.beginSpeechCapture(value);

    let permission = await queryPermission();
    state.setMicrophonePermission(permission);

    if (permission === 'prompt' || permission === 'unsupported') {
      const preflight = await requestPreflight();

      if (!preflight.ok) {
        if (preflight.reason === 'pending') {
          state.setMicrophonePermission('pending');
        } else if (preflight.reason === 'not-allowed') {
          state.setMicrophonePermission('denied');
        }

        onCancel(committedPrefixRef.current);
        state.setSpeechRecognitionError(buildSpeechErrorNotice(preflight.reason));
        return false;
      }

      permission = 'granted';
      state.setMicrophonePermission(permission);
    }

    if (permission === 'denied') {
      onCancel(committedPrefixRef.current);
      state.setSpeechRecognitionError(buildSpeechErrorNotice('not-allowed'));
      return false;
    }

    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      hadPermissionSuccessRef.current = true;
      state.setSpeechListening();
      onStart?.();
    };

    recognition.onresult = (event) => {
      const transcript = getEventTranscript(event);
      latestTranscriptRef.current = transcript;
      const nextValue = `${committedPrefixRef.current}${transcript}`;
      state.updateSpeechDraft(nextValue);
      onInterimText(nextValue);
    };

    recognition.onerror = (event: SpeechRecognitionErrorEventLike) => {
      recognitionRef.current = null;

      if (suppressNextErrorRef.current && event.error === 'aborted') {
        suppressNextErrorRef.current = false;
        return;
      }

      onCancel(committedPrefixRef.current);

      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        state.setMicrophonePermission('denied');
      }

      state.setSpeechRecognitionError(buildSpeechErrorNotice(event.error));
    };

    recognition.onend = () => {
      recognitionRef.current = null;
      suppressNextErrorRef.current = false;
    };

    try {
      recognitionRef.current = recognition;
      recognition.start();
      return true;
    } catch (error) {
      recognitionRef.current = null;
      onCancel(committedPrefixRef.current);
      state.setSpeechRecognitionError(normalizeStartError(error));
      return false;
    }
  }, [onCancel, onInterimText, onStart, queryPermission, recognitionFactory, requestPreflight, value]);

  const commitCapture = useCallback(() => {
    const state = useChatStore.getState();
    const recognition = recognitionRef.current;
    const finalValue = `${committedPrefixRef.current}${latestTranscriptRef.current.trim()}`;

    state.setSpeechProcessing();
    recognition?.stop();
    recognitionRef.current = null;
    state.commitSpeechCapture(finalValue);
    onCommit(finalValue);
  }, [onCommit]);

  const cancelCapture = useCallback(() => {
    const state = useChatStore.getState();

    cancelActiveRecognition();
    latestTranscriptRef.current = '';
    state.cancelSpeechCapture();
    onCancel(committedPrefixRef.current);
  }, [cancelActiveRecognition, onCancel]);

  return {
    startCapture,
    commitCapture,
    cancelCapture,
    cleanup,
  };
}
