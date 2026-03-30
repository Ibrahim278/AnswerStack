import { stripMarkdownAndCitations } from '@/utils/markdown';
import { getSpeechCapabilities } from '@/api/speech';
import { canCaptureAudio } from '@/lib/audioCapture';
import type {
  MicrophonePermissionState,
  MicrophonePreflightResult,
  SpeechCapabilitySnapshot,
  SpeechErrorNotice,
} from '@/types/speech';

interface PermissionAwareNavigator extends Navigator {
  permissions?: {
    query?: (descriptor: PermissionDescriptor) => Promise<PermissionStatus>;
  };
}

interface PermissionStatusWithOnChange extends PermissionStatus {
  onchange: ((this: PermissionStatus, event: Event) => unknown) | null;
}

function mapPermissionState(state: PermissionState): MicrophonePermissionState {
  if (state === 'granted' || state === 'prompt' || state === 'denied') {
    return state;
  }

  return 'unsupported';
}

function stopMediaStream(stream: MediaStream) {
  for (const track of stream.getTracks()) {
    track.stop();
  }
}

function mapPreflightError(error: unknown): MicrophonePreflightResult['reason'] {
  if (typeof error === 'object' && error && 'name' in error) {
    const name = String(error.name);

    if (
      name === 'NotAllowedError' ||
      name === 'PermissionDeniedError' ||
      name === 'SecurityError'
    ) {
      return 'not-allowed';
    }

    if (
      name === 'NotFoundError' ||
      name === 'DevicesNotFoundError' ||
      name === 'NotReadableError' ||
      name === 'TrackStartError' ||
      name === 'OverconstrainedError'
    ) {
      return 'audio-capture';
    }
  }

  return 'unknown';
}

function normalizeSpeechErrorCode(
  kind: string,
  phase: 'recognition' | 'playback',
): SpeechErrorNotice['code'] {
  switch (kind) {
    case 'not-allowed':
    case 'service-not-allowed':
      return 'not-allowed';
    case 'audio-capture':
      return 'audio-capture';
    case 'no-speech':
      return 'no-speech';
    case 'aborted':
      return phase === 'playback' ? 'playback-interrupted' : 'aborted';
    case 'network':
      return 'network';
    case 'playback-blocked':
      return 'playback-blocked';
    case 'interrupted':
    case 'canceled':
    case 'cancelled':
    case 'playback-interrupted':
      return 'playback-interrupted';
    case 'not-supported':
      return 'not-supported';
    default:
      return 'unknown';
  }
}

/**
 * Detect speech capabilities by combining backend availability with local browser checks.
 *
 * STT requires both local audio capture support (getUserMedia + MediaRecorder) AND
 * backend STT availability. TTS only requires backend TTS availability.
 */
export async function detectSpeechCapabilities(): Promise<SpeechCapabilitySnapshot> {
  const localCapture = canCaptureAudio();
  let backendStt = false;
  let backendTts = false;
  let sttProvider: string | null = null;
  let ttsProvider: string | null = null;

  try {
    const caps = await getSpeechCapabilities();
    backendStt = caps.stt.available;
    backendTts = caps.tts.available;
    sttProvider = caps.stt.provider;
    ttsProvider = caps.tts.provider;
  } catch {
    // Backend unreachable -- speech unavailable
  }

  return {
    stt: localCapture && backendStt ? 'available' : 'unavailable',
    tts: backendTts ? 'available' : 'unavailable',
    backendSttAvailable: backendStt,
    backendTtsAvailable: backendTts,
    sttProvider,
    ttsProvider,
    microphonePermission: localCapture ? 'prompt' : 'unsupported',
  };
}

export async function queryMicrophonePermission(
  nav: PermissionAwareNavigator = navigator,
): Promise<MicrophonePermissionState> {
  const query = nav.permissions?.query;
  if (!query) {
    return 'unsupported';
  }

  try {
    const status = await query.call(nav.permissions, {
      name: 'microphone' as PermissionName,
    });
    return mapPermissionState(status.state);
  } catch {
    return 'unsupported';
  }
}

export async function watchMicrophonePermission(
  onChange: (state: MicrophonePermissionState) => void,
  nav: PermissionAwareNavigator = navigator,
): Promise<() => void> {
  const query = nav.permissions?.query;
  if (!query) {
    return () => {};
  }

  try {
    const status = (await query.call(nav.permissions, {
      name: 'microphone' as PermissionName,
    })) as PermissionStatusWithOnChange;

    const handleChange = () => {
      onChange(mapPermissionState(status.state));
    };

    if (typeof status.addEventListener === 'function') {
      status.addEventListener('change', handleChange);
      return () => status.removeEventListener('change', handleChange);
    }

    status.onchange = handleChange;
    return () => {
      if (status.onchange === handleChange) {
        status.onchange = null;
      }
    };
  } catch {
    return () => {};
  }
}

export async function requestMicrophonePreflight(
  mediaDevices: MediaDevices | undefined = navigator.mediaDevices,
  timeoutMs = 4000,
): Promise<MicrophonePreflightResult> {
  if (!mediaDevices?.getUserMedia) {
    return { ok: false, reason: 'unknown' };
  }

  const streamPromise = mediaDevices.getUserMedia({ audio: true });
  void streamPromise.then(stopMediaStream).catch(() => {});

  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

  try {
    const result = await Promise.race<MediaStream | MicrophonePreflightResult>([
      streamPromise,
      new Promise<MicrophonePreflightResult>((resolve) => {
        timeoutHandle = setTimeout(() => resolve({ ok: false, reason: 'pending' }), timeoutMs);
      }),
    ]);

    if ('ok' in result) {
      return result;
    }

    stopMediaStream(result);
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: mapPreflightError(error) };
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
}

export function buildSpeechErrorNotice(
  kind: string,
  phase: 'recognition' | 'playback' = 'recognition',
): SpeechErrorNotice {
  if (kind === 'pending') {
    return {
      code: 'unknown',
      title: 'Microphone access pending',
      message: 'Allow microphone access to dictate your question.',
    };
  }

  const code = normalizeSpeechErrorCode(kind, phase);

  switch (code) {
    case 'not-supported':
      return {
        code,
        title: 'Speech unavailable',
        message: 'This browser does not expose the speech features required for this control.',
      };
    case 'not-allowed':
      return {
        code,
        title: phase === 'playback' ? 'Playback blocked' : 'Microphone access blocked',
        message:
          phase === 'playback'
            ? 'Playback could not start. Interact with the page and try again.'
            : 'Microphone access is blocked. Enable it in your browser settings, then hold to talk again.',
      };
    case 'audio-capture':
      return {
        code,
        title: 'Microphone unavailable',
        message: 'No working microphone was found. Check the device connection and retry.',
      };
    case 'no-speech':
      return {
        code,
        title: 'No speech detected',
        message: 'No speech detected. Hold to talk and speak before releasing.',
      };
    case 'aborted':
      return {
        code,
        title: 'Recording cancelled',
        message: 'Recording was cancelled before a transcript was committed.',
      };
    case 'network':
      return {
        code,
        title: 'Speech service interrupted',
        message: 'Speech service could not complete the request. Check your connection and try again.',
      };
    case 'playback-blocked':
      return {
        code,
        title: 'Playback blocked',
        message: "Playback couldn't start. Click play again after interacting with the page.",
      };
    case 'playback-interrupted':
      return {
        code,
        title: 'Playback interrupted',
        message: 'Playback stopped. Press play again to restart.',
      };
    default:
      return {
        code: 'unknown',
        title: 'Speech unavailable',
        message: 'Speech could not continue because the browser returned an unexpected error.',
      };
  }
}

export function getPlainSpeechText(markdown: string) {
  return stripMarkdownAndCitations(markdown);
}
