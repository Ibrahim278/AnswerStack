export class ApiError extends Error {
  readonly errorCode: string;
  readonly retryable: boolean;
  readonly suggestedAction: string;
  readonly statusCode: number;
  readonly requestId?: string;

  constructor(
    errorCode: string,
    message: string,
    retryable: boolean,
    suggestedAction: string,
    statusCode: number,
    requestId?: string,
  ) {
    super(message);
    this.name = 'ApiError';
    this.errorCode = errorCode;
    this.retryable = retryable;
    this.suggestedAction = suggestedAction;
    this.statusCode = statusCode;
    this.requestId = requestId;
    // Attach as property for TanStack Query global handler
    (this as unknown as Record<string, unknown>).apiError = {
      error_code: errorCode,
      message,
      retryable,
      suggested_action: suggestedAction,
      request_id: requestId,
    };
  }
}

export async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`/api/v1${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    if (body?.error_code) {
      throw new ApiError(
        body.error_code,
        body.message,
        body.retryable ?? false,
        body.suggested_action ?? '',
        response.status,
        body.request_id,
      );
    }
    throw new ApiError(
      'unknown',
      `Request failed: ${response.status}`,
      response.status >= 500,
      'Try again later',
      response.status,
    );
  }

  // 204 No Content
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export async function apiUpload<T>(path: string, formData: FormData): Promise<T> {
  // Do NOT set Content-Type header -- browser sets multipart boundary automatically
  const response = await fetch(`/api/v1${path}`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    if (body?.error_code) {
      throw new ApiError(
        body.error_code,
        body.message,
        body.retryable ?? false,
        body.suggested_action ?? '',
        response.status,
        body.request_id,
      );
    }
    throw new ApiError(
      'unknown',
      `Upload failed: ${response.status}`,
      response.status >= 500,
      'Try again later',
      response.status,
    );
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}
