import { personaStore } from './personaStore';

export class ApiError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(status: number, message: string, body: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

export interface ApiFetchOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
}

export async function apiFetch<T = unknown>(
  path: string,
  options: ApiFetchOptions = {}
): Promise<T> {
  const headers = new Headers(options.headers);

  const personaId = personaStore.getId();
  if (personaId && !headers.has('X-User-Id')) {
    headers.set('X-User-Id', personaId);
  }

  const { body: rawBody, ...rest } = options;
  const init: RequestInit = { ...rest, headers };

  if (rawBody !== undefined && rawBody !== null) {
    if (
      typeof rawBody === 'string' ||
      rawBody instanceof FormData ||
      rawBody instanceof Blob ||
      rawBody instanceof ArrayBuffer
    ) {
      init.body = rawBody as BodyInit;
    } else {
      if (!headers.has('Content-Type')) {
        headers.set('Content-Type', 'application/json');
      }
      init.body = JSON.stringify(rawBody);
    }
  }

  const response = await fetch(path, init);

  let parsed: unknown = null;
  const text = await response.text();
  if (text.length > 0) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }

  if (!response.ok) {
    const message = extractMessage(parsed) ?? response.statusText ?? 'Request failed';
    throw new ApiError(response.status, message, parsed);
  }

  return parsed as T;
}

function extractMessage(body: unknown): string | null {
  if (body && typeof body === 'object' && 'error' in body) {
    const err = (body as { error?: unknown }).error;
    if (err && typeof err === 'object' && 'message' in err) {
      const msg = (err as { message?: unknown }).message;
      if (typeof msg === 'string' && msg.length > 0) {
        return msg;
      }
    }
  }
  return null;
}
