/**
 * Cross-browser audio capture via MediaRecorder.
 *
 * Abstracts MediaRecorder/getUserMedia into a simple start/stop/cancel API.
 * Safari 18.4+ supports webm/opus; older Safari falls back to mp4/aac.
 */

export const MIME_PREFERENCES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
  'audio/ogg;codecs=opus',
  'audio/wav',
] as const;

/**
 * Detect the best audio MIME type supported by the current browser's MediaRecorder.
 * Returns an empty string if no supported type is found.
 */
export function detectAudioMimeType(): string {
  if (typeof MediaRecorder === 'undefined') {
    return '';
  }

  for (const mimeType of MIME_PREFERENCES) {
    if (MediaRecorder.isTypeSupported(mimeType)) {
      return mimeType;
    }
  }

  return '';
}

/**
 * Check whether the browser supports audio capture via MediaRecorder + getUserMedia.
 */
export function canCaptureAudio(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    typeof navigator.mediaDevices?.getUserMedia === 'function' &&
    typeof MediaRecorder !== 'undefined' &&
    detectAudioMimeType() !== ''
  );
}

export interface AudioCaptureResult {
  blob: Blob;
  mimeType: string;
  durationMs: number;
}

export interface AudioCapture {
  start(): void;
  stop(): Promise<AudioCaptureResult>;
  cancel(): void;
  isActive(): boolean;
}

/**
 * Create an AudioCapture instance wrapping a MediaRecorder for the given stream.
 *
 * @param stream - A MediaStream obtained from getUserMedia({ audio: true })
 */
export function createAudioCapture(stream: MediaStream): AudioCapture {
  const chunks: Blob[] = [];
  let active = false;
  let startTime = 0;

  const mimeType = detectAudioMimeType();

  let recorder: MediaRecorder;
  try {
    recorder = mimeType
      ? new MediaRecorder(stream, { mimeType })
      : new MediaRecorder(stream);
  } catch {
    // Fallback: create without explicit mimeType option
    recorder = new MediaRecorder(stream);
  }

  recorder.ondataavailable = (event: BlobEvent) => {
    if (event.data.size > 0) {
      chunks.push(event.data);
    }
  };

  function start(): void {
    chunks.length = 0;
    startTime = Date.now();
    active = true;
    recorder.start(250); // Collect data every 250ms
  }

  function stop(): Promise<AudioCaptureResult> {
    return new Promise<AudioCaptureResult>((resolve, reject) => {
      if (!active) {
        reject(new Error('AudioCapture is not active'));
        return;
      }

      active = false;

      recorder.onstop = () => {
        const durationMs = Date.now() - startTime;
        const resolvedMimeType = recorder.mimeType || mimeType || 'audio/webm';
        const blob = new Blob(chunks, { type: resolvedMimeType });
        chunks.length = 0;
        resolve({ blob, mimeType: resolvedMimeType, durationMs });
      };

      recorder.onerror = () => {
        active = false;
        chunks.length = 0;
        reject(new Error('MediaRecorder error during stop'));
      };

      if (recorder.state === 'recording' || recorder.state === 'paused') {
        recorder.stop();
      } else {
        // Already stopped -- resolve with whatever we have
        const durationMs = Date.now() - startTime;
        const resolvedMimeType = recorder.mimeType || mimeType || 'audio/webm';
        const blob = new Blob(chunks, { type: resolvedMimeType });
        chunks.length = 0;
        resolve({ blob, mimeType: resolvedMimeType, durationMs });
      }
    });
  }

  function cancel(): void {
    active = false;
    chunks.length = 0;

    if (recorder.state === 'recording' || recorder.state === 'paused') {
      recorder.stop();
    }

    // Stop all tracks to release the microphone
    for (const track of stream.getTracks()) {
      track.stop();
    }
  }

  function isActiveCheck(): boolean {
    return active;
  }

  return { start, stop, cancel, isActive: isActiveCheck };
}
