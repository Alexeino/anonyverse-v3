import { env, isApiBaseUrlSecure } from '../../config/env';

export class ApiError extends Error {
  status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.status = status;
  }
}

/**
 * Minimal JSON POST wrapper around the global fetch. No axios/HTTP client
 * dependency is added — docs/architecture.md's recommended stack has no
 * HTTP client entry, and RN's built-in fetch is sufficient for the plain
 * JSON REST calls in docs/api.md.
 */
export interface PostJsonOptions {
  /** Access token sent as `Authorization: Bearer <token>` for authenticated routes. */
  accessToken?: string;
  /**
   * Aborts the request (including reading its body) after this many ms,
   * throwing an ApiError with no status like any network failure. Without
   * it RN's fetch has no timeout of its own on Android.
   */
  timeoutMs?: number;
}

export async function postJson<TResponse>(
  path: string,
  body: unknown,
  options: PostJsonOptions = {},
): Promise<TResponse> {
  if (!isApiBaseUrlSecure()) {
    throw new ApiError('Refusing to send a request over an insecure API_BASE_URL');
  }

  let response: Response;

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (options.accessToken) {
    headers.Authorization = `Bearer ${options.accessToken}`;
  }

  if (__DEV__) {
    console.log(`[HTTP] → POST ${path}`);
  }

  const controller = options.timeoutMs === undefined ? undefined : new AbortController();
  const timeoutId = controller ? setTimeout(() => controller.abort(), options.timeoutMs) : undefined;

  try {
    try {
      response = await fetch(`${env.apiBaseUrl}${path}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller?.signal,
      });
    } catch (error) {
      if (__DEV__) {
        console.log(`[HTTP] ✕ POST ${path} ${controller?.signal.aborted ? 'timed out' : 'network error'}`, error);
      }
      throw new ApiError(
        controller?.signal.aborted
          ? `POST ${path} timed out after ${options.timeoutMs}ms`
          : error instanceof Error ? error.message : 'Network request failed',
      );
    }

    if (__DEV__) {
      console.log(`[HTTP] ← POST ${path} ${response.status}`);
    }

    if (!response.ok) {
      throw new ApiError(
        `POST ${path} failed with status ${response.status}`,
        response.status,
      );
    }

    try {
      return (await response.json()) as TResponse;
    } catch (error) {
      if (controller?.signal.aborted) {
        throw new ApiError(`POST ${path} timed out after ${options.timeoutMs}ms`);
      }
      throw error;
    }
  } finally {
    clearTimeout(timeoutId);
  }
}
