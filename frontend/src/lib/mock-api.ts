// Mock API layer — simulates the full AnswerStack backend
import type {
  Project, Document, IndexJob, ChatSession, ChatMessage,
  AppConfig, SystemStatus, UploadResult, SendMessageResponse, ChatSource
} from '@/types/api';

const delay = (ms: number) => new Promise(r => setTimeout(r, ms));
let idCounter = 100;
const nextId = (prefix: string) => `${prefix}_${++idCounter}`;

// --- Seed Data ---
const MOCK_PROJECTS: Project[] = [
  {
    id: 'proj_1',
    name: 'Q1 2026 Financial Review',
    description: 'Quarterly financial reports and analyst notes for Q1 2026.',
    created_at: '2026-03-10T09:00:00Z',
    updated_at: '2026-03-25T14:00:00Z',
    last_used_at: '2026-03-25T14:00:00Z',
    document_count: 4,
    readiness: 'ready',
    last_indexed_at: '2026-03-24T16:30:00Z',
  },
  {
    id: 'proj_2',
    name: 'Product Research',
    description: 'Competitive analysis and product strategy documents.',
    created_at: '2026-03-15T11:00:00Z',
    updated_at: '2026-03-22T10:00:00Z',
    last_used_at: '2026-03-22T10:00:00Z',
    document_count: 2,
    readiness: 'stale',
    last_indexed_at: '2026-03-18T12:00:00Z',
  },
];

const MOCK_DOCUMENTS: Record<string, Document[]> = {
  proj_1: [
    { document_id: 'doc_1', filename: 'quarterly-report.pdf', content_type: 'application/pdf', size_bytes: 245001, status: 'indexed', parse_error: null, indexed_at: '2026-03-24T16:30:00Z', chunk_count: 24, created_at: '2026-03-10T09:10:00Z' },
    { document_id: 'doc_2', filename: 'analyst-notes.md', content_type: 'text/markdown', size_bytes: 18200, status: 'indexed', parse_error: null, indexed_at: '2026-03-24T16:30:00Z', chunk_count: 8, created_at: '2026-03-10T09:12:00Z' },
    { document_id: 'doc_3', filename: 'revenue-summary.txt', content_type: 'text/plain', size_bytes: 4500, status: 'indexed', parse_error: null, indexed_at: '2026-03-24T16:30:00Z', chunk_count: 3, created_at: '2026-03-11T10:00:00Z' },
    { document_id: 'doc_4', filename: 'market-outlook.pdf', content_type: 'application/pdf', size_bytes: 892000, status: 'failed', parse_error: 'PDF parsing failed: encrypted or corrupted file', indexed_at: null, chunk_count: 0, created_at: '2026-03-20T14:00:00Z' },
  ],
  proj_2: [
    { document_id: 'doc_5', filename: 'competitor-analysis.pdf', content_type: 'application/pdf', size_bytes: 520000, status: 'indexed', parse_error: null, indexed_at: '2026-03-18T12:00:00Z', chunk_count: 42, created_at: '2026-03-15T11:05:00Z' },
    { document_id: 'doc_6', filename: 'strategy-draft.md', content_type: 'text/markdown', size_bytes: 12800, status: 'stale', parse_error: null, indexed_at: '2026-03-18T12:00:00Z', chunk_count: 6, created_at: '2026-03-16T09:00:00Z' },
  ],
};

const MOCK_SESSIONS: Record<string, ChatSession[]> = {
  proj_1: [
    { id: 'session_1', project_id: 'proj_1', title: 'Revenue trends', created_at: '2026-03-25T14:00:00Z', updated_at: '2026-03-25T14:10:00Z', message_count: 4 },
    { id: 'session_2', project_id: 'proj_1', title: 'Analyst consensus', created_at: '2026-03-24T10:00:00Z', updated_at: '2026-03-24T10:30:00Z', message_count: 6 },
  ],
};

const MOCK_MESSAGES: Record<string, ChatMessage[]> = {
  session_1: [
    { id: 'msg_1', session_id: 'session_1', role: 'user', content: 'What were the key revenue trends in Q1?', sources: [], created_at: '2026-03-25T14:00:00Z' },
    { id: 'msg_2', session_id: 'session_1', role: 'assistant', content: 'Based on the quarterly report, revenue grew 18% year-over-year to $4.2B in Q1 2026. The growth was primarily driven by enterprise subscriptions (+24%) and cloud services (+31%). Consumer segment showed modest growth of 6%, consistent with the market slowdown noted in the analyst notes.', sources: [
      { document_id: 'doc_1', filename: 'quarterly-report.pdf', snippet: 'Total revenue reached $4.2 billion in Q1 2026, representing 18% year-over-year growth. Enterprise subscriptions grew 24% to $2.1B...', chunk_id: 'chunk_3' },
      { document_id: 'doc_2', filename: 'analyst-notes.md', snippet: 'Consumer segment growth of 6% is in line with industry-wide slowdown. Enterprise and cloud remain the key growth vectors...', chunk_id: 'chunk_12' },
    ], created_at: '2026-03-25T14:00:30Z', model: 'gpt-4o' },
  ],
  session_2: [],
};

const MOCK_JOBS: IndexJob[] = [
  { job_id: 'job_1', project_id: 'proj_1', status: 'completed', trigger_reason: 'manual_rebuild', progress_current: 4, progress_total: 4, last_error: null, started_at: '2026-03-24T16:28:00Z', finished_at: '2026-03-24T16:30:00Z', config_snapshot: { embedding_model: 'text-embedding-3-small', chunk_size: 700, chunk_overlap: 80 } },
];

const MOCK_CONFIG: AppConfig = {
  api_base_url: 'http://localhost:1234/v1',
  api_key_configured: true,
  llm_model: 'gpt-4o',
  embedding_model: 'text-embedding-3-small',
  temperature: 0.4,
  top_k: 4,
  chunk_size: 700,
  chunk_overlap: 80,
  system_prompt: 'Answer using the provided sources only. If the answer cannot be found in the sources, say so clearly.',
  speech: { stt_enabled: true, tts_enabled: true, tts_voice: 'alloy' },
  capabilities: { provider: 'available', models: 'available', stt: 'available', tts: 'available' },
};

const MOCK_STATUS: SystemStatus = {
  readiness: 'ready',
  active_project_id: 'proj_1',
  active_job_count: 0,
  provider_status: 'available',
  speech_status: { stt: 'available', tts: 'available' },
  last_indexed_at: '2026-03-24T16:30:00Z',
};

// ---- Mock API Functions ----

export const api = {
  // Projects
  async getProjects(): Promise<Project[]> {
    await delay(300);
    return [...MOCK_PROJECTS];
  },
  async getProject(id: string): Promise<Project | undefined> {
    await delay(200);
    return MOCK_PROJECTS.find(p => p.id === id);
  },
  async createProject(name: string, description: string): Promise<Project> {
    await delay(400);
    const project: Project = {
      id: nextId('proj'),
      name,
      description,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      last_used_at: new Date().toISOString(),
      document_count: 0,
      readiness: 'no_documents',
      last_indexed_at: null,
    };
    MOCK_PROJECTS.push(project);
    MOCK_DOCUMENTS[project.id] = [];
    MOCK_SESSIONS[project.id] = [];
    return project;
  },
  async deleteProject(id: string): Promise<void> {
    await delay(300);
    const idx = MOCK_PROJECTS.findIndex(p => p.id === id);
    if (idx !== -1) MOCK_PROJECTS.splice(idx, 1);
    delete MOCK_DOCUMENTS[id];
    delete MOCK_SESSIONS[id];
  },

  // Documents
  async getDocuments(projectId: string): Promise<Document[]> {
    await delay(300);
    return MOCK_DOCUMENTS[projectId] || [];
  },
  async uploadDocuments(projectId: string, files: File[]): Promise<UploadResult> {
    await delay(800);
    const uploaded: UploadResult['uploaded'] = [];
    const rejected: UploadResult['rejected'] = [];
    for (const file of files) {
      const ext = file.name.split('.').pop()?.toLowerCase();
      if (!['txt', 'md', 'pdf'].includes(ext || '')) {
        rejected.push({ filename: file.name, reason: 'unsupported_file_type' });
        continue;
      }
      const doc: Document = {
        document_id: nextId('doc'),
        filename: file.name,
        content_type: file.type || 'application/octet-stream',
        size_bytes: file.size,
        status: 'uploaded',
        parse_error: null,
        indexed_at: null,
        chunk_count: 0,
        created_at: new Date().toISOString(),
      };
      if (!MOCK_DOCUMENTS[projectId]) MOCK_DOCUMENTS[projectId] = [];
      MOCK_DOCUMENTS[projectId].push(doc);
      uploaded.push({ document_id: doc.document_id, filename: doc.filename, status: 'uploaded' });
      // Simulate async parsing
      setTimeout(() => { doc.status = 'parsed'; }, 2000);
    }
    const proj = MOCK_PROJECTS.find(p => p.id === projectId);
    if (proj) {
      proj.document_count = (MOCK_DOCUMENTS[projectId] || []).length;
      if (proj.readiness === 'no_documents') proj.readiness = 'stale';
    }
    return { uploaded, duplicates: [], rejected };
  },
  async deleteDocument(projectId: string, documentId: string): Promise<void> {
    await delay(300);
    const docs = MOCK_DOCUMENTS[projectId];
    if (docs) {
      const idx = docs.findIndex(d => d.document_id === documentId);
      if (idx !== -1) docs.splice(idx, 1);
    }
  },

  // Index Jobs
  async getIndexJobs(projectId: string): Promise<IndexJob[]> {
    await delay(200);
    return MOCK_JOBS.filter(j => j.project_id === projectId);
  },
  async startIndexJob(projectId: string): Promise<IndexJob> {
    await delay(400);
    const docs = MOCK_DOCUMENTS[projectId] || [];
    const total = docs.filter(d => d.status !== 'failed').length;
    const job: IndexJob = {
      job_id: nextId('job'),
      project_id: projectId,
      status: 'running',
      trigger_reason: 'manual_rebuild',
      progress_current: 0,
      progress_total: total,
      last_error: null,
      started_at: new Date().toISOString(),
      finished_at: null,
      config_snapshot: { embedding_model: MOCK_CONFIG.embedding_model, chunk_size: MOCK_CONFIG.chunk_size, chunk_overlap: MOCK_CONFIG.chunk_overlap },
    };
    MOCK_JOBS.push(job);
    // Simulate progress
    let current = 0;
    const tick = setInterval(() => {
      current++;
      job.progress_current = current;
      if (current >= total) {
        clearInterval(tick);
        job.status = 'completed';
        job.finished_at = new Date().toISOString();
        docs.forEach(d => { if (d.status !== 'failed') { d.status = 'indexed'; d.indexed_at = new Date().toISOString(); d.chunk_count = Math.floor(Math.random() * 20) + 5; } });
        const proj = MOCK_PROJECTS.find(p => p.id === projectId);
        if (proj) { proj.readiness = 'ready'; proj.last_indexed_at = new Date().toISOString(); }
      }
    }, 1200);
    return job;
  },
  async getIndexJob(jobId: string): Promise<IndexJob | undefined> {
    await delay(200);
    return MOCK_JOBS.find(j => j.job_id === jobId);
  },

  // Chat
  async getSessions(projectId: string): Promise<ChatSession[]> {
    await delay(200);
    return MOCK_SESSIONS[projectId] || [];
  },
  async createSession(projectId: string, title?: string): Promise<ChatSession> {
    await delay(300);
    const session: ChatSession = {
      id: nextId('session'),
      project_id: projectId,
      title: title || 'New conversation',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      message_count: 0,
    };
    if (!MOCK_SESSIONS[projectId]) MOCK_SESSIONS[projectId] = [];
    MOCK_SESSIONS[projectId].push(session);
    MOCK_MESSAGES[session.id] = [];
    return session;
  },
  async getMessages(sessionId: string): Promise<ChatMessage[]> {
    await delay(200);
    return MOCK_MESSAGES[sessionId] || [];
  },
  async sendMessage(sessionId: string, content: string): Promise<SendMessageResponse> {
    await delay(300);
    const userMsg: ChatMessage = {
      id: nextId('msg'),
      session_id: sessionId,
      role: 'user',
      content,
      sources: [],
      created_at: new Date().toISOString(),
    };
    const assistantId = nextId('msg');
    if (!MOCK_MESSAGES[sessionId]) MOCK_MESSAGES[sessionId] = [];
    MOCK_MESSAGES[sessionId].push(userMsg);
    return {
      user_message_id: userMsg.id,
      assistant_message_id: assistantId,
      session_id: sessionId,
      stream_url: `/api/v1/sessions/${sessionId}/stream?message_id=${assistantId}`,
    };
  },
  async deleteSession(sessionId: string): Promise<void> {
    await delay(200);
    for (const projectId of Object.keys(MOCK_SESSIONS)) {
      const sessions = MOCK_SESSIONS[projectId];
      const idx = sessions.findIndex(s => s.id === sessionId);
      if (idx !== -1) { sessions.splice(idx, 1); break; }
    }
    delete MOCK_MESSAGES[sessionId];
  },

  // Simulated streaming
  async *streamAnswer(sessionId: string, assistantMessageId: string): AsyncGenerator<{ event: string; data: Record<string, unknown> }> {
    await delay(500);
    yield { event: 'message_start', data: { assistant_message_id: assistantMessageId, session_id: sessionId } };

    const tokens = [
      'Based on ', 'the documents ', 'in your ', 'knowledge base, ',
      'the quarterly report ', 'indicates ', 'several key ', 'findings. ',
      'Revenue grew ', '18% year-over-year ', 'to $4.2 billion, ',
      'driven primarily ', 'by enterprise ', 'subscriptions ', 'which grew 24%. ',
      'Cloud services ', 'showed the ', 'strongest growth ', 'at 31%, ',
      'while the consumer ', 'segment grew ', 'a modest 6%, ',
      'consistent with ', 'the broader ', 'market slowdown.',
    ];

    let fullContent = '';
    for (const token of tokens) {
      await delay(40 + Math.random() * 60);
      fullContent += token;
      yield { event: 'token', data: { assistant_message_id: assistantMessageId, content: token } };
    }

    const sources: ChatSource[] = [
      { document_id: 'doc_1', filename: 'quarterly-report.pdf', snippet: 'Total revenue reached $4.2 billion in Q1 2026, representing 18% year-over-year growth...', chunk_id: 'chunk_3' },
      { document_id: 'doc_2', filename: 'analyst-notes.md', snippet: 'Enterprise subscriptions grew 24% to $2.1B, making it the largest revenue segment...', chunk_id: 'chunk_12' },
      { document_id: 'doc_3', filename: 'revenue-summary.txt', snippet: 'Cloud services revenue increased 31% YoY, accelerating from 22% growth in Q4...', chunk_id: 'chunk_7' },
    ];
    yield { event: 'sources', data: { assistant_message_id: assistantMessageId, sources } };

    // Store the completed message
    const assistantMsg: ChatMessage = {
      id: assistantMessageId,
      session_id: sessionId,
      role: 'assistant',
      content: fullContent,
      sources,
      created_at: new Date().toISOString(),
      model: 'gpt-4o',
    };
    if (!MOCK_MESSAGES[sessionId]) MOCK_MESSAGES[sessionId] = [];
    MOCK_MESSAGES[sessionId].push(assistantMsg);

    yield { event: 'message_complete', data: { assistant_message_id: assistantMessageId } };
    yield { event: 'done', data: { assistant_message_id: assistantMessageId } };
  },

  // Config
  async getConfig(): Promise<AppConfig> {
    await delay(200);
    return { ...MOCK_CONFIG };
  },
  async updateConfig(updates: Partial<AppConfig>): Promise<AppConfig> {
    await delay(400);
    Object.assign(MOCK_CONFIG, updates);
    return { ...MOCK_CONFIG };
  },
  async testConnection(): Promise<{ success: boolean; message: string; latency_ms: number }> {
    await delay(1200);
    return { success: true, message: 'Provider connection successful', latency_ms: 142 };
  },

  // System
  async getSystemStatus(): Promise<SystemStatus> {
    await delay(200);
    return { ...MOCK_STATUS };
  },
};
