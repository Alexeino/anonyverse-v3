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

  try {
    response = await fetch(`${env.apiBaseUrl}${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
  } catch (error) {
    throw new ApiError(
      error instanceof Error ? error.message : 'Network request failed',
    );
  }

  if (!response.ok) {
    throw new ApiError(
      `POST ${path} failed with status ${response.status}`,
      response.status,
    );
  }

  return (await response.json()) as TResponse;
}
