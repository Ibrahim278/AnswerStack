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

export interface SpeechCapabilitySnapshot {
  stt: SpeechCapabilityState;
  tts: SpeechCapabilityState;
  backendSttAvailable: boolean;
  backendTtsAvailable: boolean;
  sttProvider: string | null;
  ttsProvider: string | null;
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
