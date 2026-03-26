export const queryKeys = {
  projects: {
    all: ['projects'] as const,
    detail: (id: string) => ['projects', id] as const,
  },
  documents: (projectId: string) => ['projects', projectId, 'documents'] as const,
  settings: ['settings'] as const,
  provider: {
    models: ['provider', 'models'] as const,
    testConnection: ['provider', 'test-connection'] as const,
  },
  indexing: (projectId: string) => ['projects', projectId, 'indexing'] as const,
  systemStatus: (projectId?: string) => ['system-status', projectId] as const,
  health: ['health'] as const,
};
