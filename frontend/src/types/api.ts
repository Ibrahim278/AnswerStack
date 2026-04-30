// AnswerStack API Types — mirrors the PRD contract exactly

export type ProjectReadiness = 'ready' | 'no_documents' | 'indexing' | 'stale' | 'misconfigured' | 'degraded';
export type DocumentStatus = 'uploaded' | 'parsing' | 'parsed' | 'indexing' | 'indexed' | 'failed' | 'stale' | 'reindex_required';
export type JobStatus = 'pending' | 'running' | 'completed' | 'failed' | 'canceled';
export type CapabilityStatus = 'available' | 'unavailable' | 'degraded';
export type SystemReadiness = 'ready' | 'indexing' | 'misconfigured' | 'degraded';

export interface ApiMeta {
  request_id: string;
  timestamp: string;
}

export interface ApiResponse<T> {
  data: T;
  meta: ApiMeta;
}

export interface ApiError {
  error: {
    code: string;
    message: string;
    retryable: boolean;
    suggested_action?: string;
  };
  meta: ApiMeta;
}

// --- Projects ---
export interface Project {
  id: string;
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
  last_used_at: string;
  document_count: number;
  readiness: ProjectReadiness;
  last_indexed_at: string | null;
}

// --- Documents ---
export interface Document {
  document_id: string;
  filename: string;
  content_type: string;
  size_bytes: number;
  status: DocumentStatus;
  parse_error: string | null;
  indexed_at: string | null;
  chunk_count: number;
  created_at: string;
}

export interface UploadResult {
  uploaded: Array<{ document_id: string; filename: string; status: string }>;
  duplicates: Array<{ filename: string; existing_document_id: string }>;
  rejected: Array<{ filename: string; reason: string }>;
}

// --- Index Jobs ---
export interface IndexJob {
  job_id: string;
  project_id: string;
  status: JobStatus;
  trigger_reason: string;
  progress_current: number;
  progress_total: number;
  last_error: string | null;
  started_at: string | null;
  finished_at: string | null;
  config_snapshot: {
    embedding_model: string;
    chunk_size: number;
    chunk_overlap: number;
  };
}

// --- Chat ---
export interface ChatSession {
  id: string;
  project_id: string;
  title: string;
  created_at: string;
  updated_at: string;
  message_count: number;
}

export interface ChatSource {
  document_id: string;
  filename: string;
  snippet: string;
  chunk_id: string;
}

export interface ChatMessage {
  id: string;
  session_id: string;
  role: 'user' | 'assistant';
  content: string;
  sources: ChatSource[];
  created_at: string;
  model?: string;
}

export interface SendMessageResponse {
  user_message_id: string;
  assistant_message_id: string;
  session_id: string;
  stream_url: string;
}

// --- Config ---
export interface AppConfig {
  api_base_url: string;
  api_key_configured: boolean;
  llm_model: string;
  embedding_model: string;
  temperature: number;
  top_k: number;
  chunk_size: number;
  chunk_overlap: number;
  system_prompt: string;
  speech: {
    stt_enabled: boolean;
    tts_enabled: boolean;
    tts_voice: string;
  };
  capabilities: {
    provider: CapabilityStatus;
    models: CapabilityStatus;
    stt: CapabilityStatus;
    tts: CapabilityStatus;
  };
}

// --- System Status ---
export interface SystemStatus {
  readiness: SystemReadiness;
  active_project_id: string | null;
  active_job_count: number;
  provider_status: CapabilityStatus;
  speech_status: {
    stt: CapabilityStatus;
    tts: CapabilityStatus;
  };
  last_indexed_at: string | null;
}

// --- SSE Events ---
export type SSEEventType = 'message_start' | 'token' | 'sources' | 'message_complete' | 'error' | 'done';

export interface SSEEvent {
  event: SSEEventType;
  data: Record<string, unknown>;
}
