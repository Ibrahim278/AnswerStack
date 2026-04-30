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

/**
 * Prepare a synthesis token and return a GET URL that can be assigned
 * to an <audio> element's src for progressive streaming playback.
 */
export async function prepareSynthesisUrl(
  text: string,
  voiceId?: string,
  signal?: AbortSignal,
): Promise<string> {
  const response = await fetch('/api/v1/speech/synthesize/prepare', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, voice_id: voiceId || undefined }),
    signal,
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.message || `Synthesis preparation failed: ${response.status}`);
  }

  const data = await response.json();
  return data.url as string;
}

export interface TTSProviderItem {
  id: string;
  name: string;
  available: boolean;
  reason?: string;
}

export interface TTSProvidersResponse {
  providers: TTSProviderItem[];
  active: string | null;
}

export async function getSpeechCapabilities(): Promise<SpeechCapabilitiesResponse> {
  return apiFetch<SpeechCapabilitiesResponse>('/speech/capabilities');
}

export async function getTTSProviders(): Promise<TTSProvidersResponse> {
  return apiFetch<TTSProvidersResponse>('/speech/providers');
}

export async function getVoices(provider?: string): Promise<VoicesResponse> {
  const params = provider ? `?provider=${encodeURIComponent(provider)}` : '';
  return apiFetch<VoicesResponse>(`/speech/voices${params}`);
}
