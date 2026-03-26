import type { SSESourceItem } from '../types';

export function parseSources(rawSources: unknown): SSESourceItem[] {
  if (Array.isArray(rawSources)) {
    return rawSources as SSESourceItem[];
  }

  if (typeof rawSources === 'string') {
    try {
      const parsed = JSON.parse(rawSources) as unknown;
      return Array.isArray(parsed) ? (parsed as SSESourceItem[]) : [];
    } catch {
      return [];
    }
  }

  return [];
}
