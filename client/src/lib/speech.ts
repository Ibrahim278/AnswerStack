import { stripMarkdownAndCitations } from '@/utils/markdown';
import type {
  MicrophonePermissionState,
  MicrophonePreflightResult,
  SpeechCapabilitySnapshot,
  SpeechErrorNotice,
  SpeechRecognitionCtorLike,
  SpeechSynthesisLike,
} from '@/types/speech';

interface BrowserSpeechWindow extends Window {
  SpeechRecognition?: SpeechRecognitionCtorLike;
  webkitSpeechRecognition?: SpeechRecognitionCtorLike;
  SpeechSynthesisUtterance?: typeof SpeechSynthesisUtterance;
}

interface PermissionAwareNavigator extends Navigator {
  permissions?: {
    query?: (descriptor: PermissionDescriptor) => Promise<PermissionStatus>;
  };
}

interface PermissionStatusWithOnChange extends PermissionStatus {
  onchange: ((this: PermissionStatus, event: Event) => unknown) | null;
}

const voiceCountCache = new WeakMap<BrowserSpeechWindow, number>();
const voiceListeners = new WeakSet<SpeechSynthesis>();

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

function refreshVoiceCount(win: BrowserSpeechWindow) {
  const voicesAvailable = win.speechSynthesis?.getVoices().length ?? 0;
  voiceCountCache.set(win, voicesAvailable);
  return voicesAvailable;
}

export function getSpeechRecognitionCtor(win: BrowserSpeechWindow = window) {
  return win.SpeechRecognition ?? win.webkitSpeechRecognition ?? null;
}

export function detectSpeechCapabilities(
  win: BrowserSpeechWindow = window,
): SpeechCapabilitySnapshot {
  const stt = getSpeechRecognitionCtor(win) ? 'available' : 'unavailable';
  const tts =
    win.speechSynthesis && win.SpeechSynthesisUtterance ? 'available' : 'unavailable';

  let voicesAvailable = 0;
  if (tts === 'available' && win.speechSynthesis) {
    voicesAvailable = refreshVoiceCount(win);

    if (voicesAvailable === 0 && !voiceListeners.has(win.speechSynthesis)) {
      const handleVoicesChanged = () => {
        refreshVoiceCount(win);
      };

      if (typeof win.speechSynthesis.addEventListener === 'function') {
        win.speechSynthesis.addEventListener('voiceschanged', handleVoicesChanged);
      } else {
        win.speechSynthesis.onvoiceschanged = handleVoicesChanged;
      }

      voiceListeners.add(win.speechSynthesis);
      voicesAvailable = voiceCountCache.get(win) ?? 0;
    }
  }

  return {
    stt,
    tts,
    voicesAvailable,
    microphonePermission: stt === 'available' ? 'pending' : 'unsupported',
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
            : 'Microphone access is blocked. Allow access in Chromium and try again.',
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
        message: 'No speech was detected before recording ended. Try again and speak sooner.',
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
        message: 'Speech recognition lost its network connection. Retry once the browser is back online.',
      };
    case 'playback-blocked':
      return {
        code,
        title: 'Playback blocked',
        message: 'The browser blocked playback from starting. Interact with the page and try again.',
      };
    case 'playback-interrupted':
      return {
        code,
        title: 'Playback interrupted',
        message: 'Playback stopped before the answer finished. Start it again when ready.',
      };
    default:
      return {
        code: 'unknown',
        title: 'Speech unavailable',
        message: 'Speech could not continue because the browser returned an unexpected error.',
      };
  }
}

export function resolveSpeechSynthesisVoice(
  synth: SpeechSynthesisLike,
  previousVoiceUri?: string | null,
) {
  const voices = synth.getVoices();
  const fallbackVoice = voices[0] ?? null;

  if (!previousVoiceUri) {
    return { voice: fallbackVoice, voicesAvailable: voices.length };
  }

  const selectedVoice = voices.find((voice) => voice.voiceURI === previousVoiceUri) ?? fallbackVoice;
  return { voice: selectedVoice, voicesAvailable: voices.length };
}

export function getPlainSpeechText(markdown: string) {
  return stripMarkdownAndCitations(markdown);
}
