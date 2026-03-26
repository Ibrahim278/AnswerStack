// --- SSE Event Types (D-61) ---
export interface SSEMessageStart {
  session_id: string;
  message_id: string;
}

// Signal-only event, empty data (D-88)
export type SSERetrievalStart = Record<string, never>;

export interface SSESourceItem {
  document_name: string;
  chunk_text: string;
  page_number: number | null;
  relevance_score: number;
}

export interface SSEMessageComplete {
  token_count: number;
}

export interface SSEError {
  code: string;
  message: string;
}

// --- API Response Types (mirroring backend schemas) ---
export interface ChatSessionResponse {
  id: string;
  project_id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface ChatMessageResponse {
  id: string;
  session_id: string;
  role: 'user' | 'assistant';
  content: string;
  sources_json: SSESourceItem[] | null;
  created_at: string;
}

export interface ChatSessionDetailResponse extends ChatSessionResponse {
  messages: ChatMessageResponse[];
}

export interface SuggestedPromptsResponse {
  prompts: string[];
}

// --- Stream Phase (D-64) ---
export type StreamPhase = 'idle' | 'searching' | 'generating' | 'complete' | 'error' | 'stopped';
