import { useCallback, useEffect, useRef } from 'react';
import {
  buildSpeechErrorNotice,
  queryMicrophonePermission,
  requestMicrophonePreflight,
  watchMicrophonePermission,
} from '@/lib/speech';
import { createAudioCapture, type AudioCapture } from '@/lib/audioCapture';
import { transcribeAudio } from '@/api/speech';
import { useChatStore } from '@/stores/chatStore';
import type {
  MicrophonePermissionState,
  MicrophonePreflightResult,
  SpeechErrorNotice,
} from '@/types/speech';

/** Minimum blob size (bytes) to consider as containing speech data. */
const MIN_BLOB_SIZE = 100;

/** Maximum recording duration before auto-commit (ms). */
const MAX_RECORDING_DURATION_MS = 60_000;

interface UseSpeechRecognitionOptions {
  value: string;
  onInterimText: (nextValue: string) => void;
  onCommit: (finalValue: string) => void;
  onCancel: (restoreValue: string) => void;
  onStart?: () => void;
  getUserMediaFn?: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
  createCaptureFn?: (stream: MediaStream) => AudioCapture;
  transcribeFn?: (blob: Blob, mimeType: string, lang: string) => Promise<{ text: string }>;
  queryPermission?: () => Promise<MicrophonePermissionState>;
  requestPreflight?: () => Promise<MicrophonePreflightResult>;
}

interface UseSpeechRecognitionResult {
  startCapture: () => Promise<boolean>;
  commitCapture: () => Promise<void>;
  cancelCapture: () => void;
  cleanup: () => void;
}

function normalizeGetUserMediaError(error: unknown): SpeechErrorNotice {
  if (typeof error === 'object' && error && 'name' in error) {
    const name = String(error.name);

    if (name === 'NotAllowedError' || name === 'PermissionDeniedError' || name === 'SecurityError') {
      return buildSpeechErrorNotice('not-allowed');
    }

    if (
      name === 'NotFoundError' ||
      name === 'DevicesNotFoundError' ||
      name === 'NotReadableError' ||
      name === 'TrackStartError' ||
      name === 'OverconstrainedError'
    ) {
      return buildSpeechErrorNotice('audio-capture');
    }
  }

  return buildSpeechErrorNotice('unknown');
}

export function useSpeechRecognition({
  value,
  onInterimText,
  onCommit,
  onCancel,
  onStart,
  getUserMediaFn,
  createCaptureFn,
  transcribeFn,
  queryPermission = queryMicrophonePermission,
  requestPreflight = requestMicrophonePreflight,
}: UseSpeechRecognitionOptions): UseSpeechRecognitionResult {
  const captureRef = useRef<AudioCapture | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const committedPrefixRef = useRef('');
  const permissionCleanupRef = useRef<() => void>(() => {});
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hadPermissionSuccessRef = useRef(false);

  // Callback refs to avoid stale closures
  const onInterimTextRef = useRef(onInterimText);
  const onCommitRef = useRef(onCommit);
  const onCancelRef = useRef(onCancel);
  const onStartRef = useRef(onStart);

  useEffect(() => {
    onInterimTextRef.current = onInterimText;
    onCommitRef.current = onCommit;
    onCancelRef.current = onCancel;
    onStartRef.current = onStart;
  }, [onInterimText, onCommit, onCancel, onStart]);

  const clearRecordingTimeout = useCallback(() => {
    if (timeoutRef.current !== null) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const cancelActiveCapture = useCallback(() => {
    clearRecordingTimeout();
    const capture = captureRef.current;
    if (capture) {
      capture.cancel();
      captureRef.current = null;
    }
    streamRef.current = null;
  }, [clearRecordingTimeout]);

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

      cancelActiveCapture();
      state.cancelSpeechCapture();
      onCancelRef.current(committedPrefixRef.current);
      state.setSpeechRecognitionError(buildSpeechErrorNotice('not-allowed'));
    },
    [cancelActiveCapture],
  );

  const cleanup = useCallback(() => {
    permissionCleanupRef.current();
    permissionCleanupRef.current = () => {};
    cancelActiveCapture();
    cleanupStoreState();
  }, [cancelActiveCapture, cleanupStoreState]);

  // Permission watcher
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

  // commitCapture needs to be a ref-stable async function for the timeout
  const commitCaptureImpl = useCallback(async () => {
    const state = useChatStore.getState();
    clearRecordingTimeout();

    state.setSpeechProcessing();

    const capture = captureRef.current;
    if (!capture) {
      state.cancelSpeechCapture();
      onCancelRef.current(committedPrefixRef.current);
      return;
    }

    try {
      const result = await capture.stop();

      // Release microphone
      if (streamRef.current) {
        for (const track of streamRef.current.getTracks()) {
          track.stop();
        }
      }

      captureRef.current = null;
      streamRef.current = null;

      // Check for empty/tiny blob (no speech detected)
      if (result.blob.size < MIN_BLOB_SIZE) {
        state.setSpeechRecognitionError(buildSpeechErrorNotice('no-speech'));
        onCancelRef.current(committedPrefixRef.current);
        return;
      }

      // Transcribe via backend
      const doTranscribe = transcribeFn ?? transcribeAudio;
      const resp = await doTranscribe(result.blob, result.mimeType, 'en');
      const finalValue = `${committedPrefixRef.current}${(resp.text || '').trim()}`;
      state.commitSpeechCapture(finalValue);
      onCommitRef.current(finalValue);
    } catch {
      captureRef.current = null;
      streamRef.current = null;
      state.setSpeechRecognitionError(buildSpeechErrorNotice('network'));
      onCancelRef.current(committedPrefixRef.current);
    }
  }, [clearRecordingTimeout, transcribeFn]);

  const commitCapture = useCallback(async () => {
    await commitCaptureImpl();
  }, [commitCaptureImpl]);

  const cancelCapture = useCallback(() => {
    const state = useChatStore.getState();
    cancelActiveCapture();
    state.cancelSpeechCapture();
    onCancelRef.current(committedPrefixRef.current);
  }, [cancelActiveCapture]);

  const startCapture = useCallback(async () => {
    const state = useChatStore.getState();

    committedPrefixRef.current = value;
    state.beginSpeechCapture(value);

    // Check microphone permission
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

        onCancelRef.current(committedPrefixRef.current);
        state.setSpeechRecognitionError(buildSpeechErrorNotice(preflight.reason));
        return false;
      }

      permission = 'granted';
      state.setMicrophonePermission(permission);
    }

    if (permission === 'denied') {
      onCancelRef.current(committedPrefixRef.current);
      state.setSpeechRecognitionError(buildSpeechErrorNotice('not-allowed'));
      return false;
    }

    // Acquire microphone stream
    const doGetUserMedia = getUserMediaFn ?? navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    let stream: MediaStream;
    try {
      stream = await doGetUserMedia({ audio: true });
    } catch (error) {
      const notice = normalizeGetUserMediaError(error);
      if (notice.code === 'not-allowed') {
        state.setMicrophonePermission('denied');
      }
      onCancelRef.current(committedPrefixRef.current);
      state.setSpeechRecognitionError(notice);
      return false;
    }

    streamRef.current = stream;
    hadPermissionSuccessRef.current = true;

    // Create audio capture
    const doCreateCapture = createCaptureFn ?? createAudioCapture;
    const capture = doCreateCapture(stream);
    captureRef.current = capture;

    // Start recording
    capture.start();
    state.setSpeechListening();
    onStartRef.current?.();

    // Set 60-second timeout
    timeoutRef.current = setTimeout(() => {
      void commitCaptureImpl();
    }, MAX_RECORDING_DURATION_MS);

    return true;
  }, [
    commitCaptureImpl,
    createCaptureFn,
    getUserMediaFn,
    queryPermission,
    requestPreflight,
    value,
  ]);

  return {
    startCapture,
    commitCapture,
    cancelCapture,
    cleanup,
  };
}
