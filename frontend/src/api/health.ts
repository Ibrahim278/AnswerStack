import { apiFetch } from '@/api/client';
import type { LivenessResponse, ReadinessResponse } from '@/types';

class HealthApi {
  async live(): Promise<LivenessResponse> {
    return apiFetch<LivenessResponse>('/health/live');
  }

  async ready(): Promise<ReadinessResponse> {
    return apiFetch<ReadinessResponse>('/health/ready');
  }
}

export const healthApi = new HealthApi();
