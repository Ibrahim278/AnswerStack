export type SpeechCapabilityState = 'available' | 'unavailable';
export type SpeechRecognitionState = 'unsupported' | 'idle' | 'arming' | 'listening' | 'processing' | 'error';
export type SpeechPlaybackState = 'idle' | 'starting' | 'playing' | 'stopped' | 'error';
export type SpeechErrorCode =
  | 'not-supported'
  | 'not-allowed'
  | 'audio-capture'
  | 'no-speech'
  | 'aborted'
  | 'network'
  | 'playback-blocked'
  | 'playback-interrupted'
  | 'unknown';

export interface SpeechErrorNotice {
  code: SpeechErrorCode;
  title: string;
  message: string;
}

export type MicrophonePermissionState = 'granted' | 'prompt' | 'denied' | 'unsupported' | 'pending';

export interface SpeechRecognitionAlternativeLike {
  transcript: string;
  confidence?: number;
}

export interface SpeechRecognitionResultLike {
  isFinal: boolean;
  length: number;
  [index: number]: SpeechRecognitionAlternativeLike;
}

export interface SpeechRecognitionEventLike extends Event {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
}

export interface SpeechRecognitionErrorEventLike extends Event {
  error: string;
  message?: string;
}

export interface SpeechRecognitionLike extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  onstart: ((event: Event) => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: ((event: Event) => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

export interface SpeechRecognitionCtorLike {
  new (): SpeechRecognitionLike;
}

export interface SpeechSynthesisLike {
  cancel: () => void;
  getVoices: () => SpeechSynthesisVoice[];
  speak: (utterance: SpeechSynthesisUtterance) => void;
}

export interface SpeechCapabilitySnapshot {
  stt: SpeechCapabilityState;
  tts: SpeechCapabilityState;
  voicesAvailable: number;
  microphonePermission: MicrophonePermissionState;
}

export interface MicrophonePreflightSuccess {
  ok: true;
}

export interface MicrophonePreflightFailure {
  ok: false;
  reason: 'not-allowed' | 'audio-capture' | 'pending' | 'unknown';
}

export type MicrophonePreflightResult = MicrophonePreflightSuccess | MicrophonePreflightFailure;
