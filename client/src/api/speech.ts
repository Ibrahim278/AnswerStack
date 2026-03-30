import { apiFetch } from './client';

export interface TranscriptionResponse {
  text: string;
  language_code: string | null;
}

export interface SpeechCapabilitiesResponse {
  stt: { available: boolean; provider: string | null };
  tts: { available: boolean; provider: string | null; voices_count: number };
}

export interface VoiceItem {
  voice_id: string;
  name: string;
  labels?: Record<string, string> | null;
}

export interface VoicesResponse {
  voices: VoiceItem[];
}

export async function transcribeAudio(
  blob: Blob,
  mimeType: string,
  languageCode: string = 'en',
): Promise<TranscriptionResponse> {
  const formData = new FormData();
  const ext = mimeType.includes('mp4')
    ? 'mp4'
    : mimeType.includes('ogg')
      ? 'ogg'
      : 'webm';
  formData.append('file', blob, `recording.${ext}`);
  formData.append('language_code', languageCode);

  const response = await fetch('/api/v1/speech/transcribe', {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.message || `Transcription failed: ${response.status}`);
  }

  return response.json();
}

export async function synthesizeAudio(
  text: string,
  voiceId?: string,
  signal?: AbortSignal,
): Promise<Blob> {
  const response = await fetch('/api/v1/speech/synthesize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, voice_id: voiceId || undefined }),
    signal,
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.message || `Synthesis failed: ${response.status}`);
  }

  const blob = await response.blob();
  // Ensure the blob has the correct MIME type for Audio element playback.
  // Some proxies strip content-type, leaving blob.type empty which breaks new Audio(url).
  if (!blob.type || blob.type === 'application/octet-stream') {
    return new Blob([blob], { type: 'audio/mpeg' });
  }
  return blob;
}

export async function getSpeechCapabilities(): Promise<SpeechCapabilitiesResponse> {
  return apiFetch<SpeechCapabilitiesResponse>('/speech/capabilities');
}

export async function getVoices(): Promise<VoicesResponse> {
  return apiFetch<VoicesResponse>('/speech/voices');
}
