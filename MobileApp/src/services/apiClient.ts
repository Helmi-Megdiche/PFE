/**
 * Central HTTP client — every request sends `Authorization: Bearer <JWT>`.
 * Wire `configureApiClient` once at app startup with your existing token store.
 */

export type GetAccessToken = () => string | null | Promise<string | null>;

export class ApiAuthError extends Error {
  readonly status = 401;
  constructor(message = 'Authentication required') {
    super(message);
    this.name = 'ApiAuthError';
  }
}

export class ApiHttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly body?: string,
  ) {
    super(message);
    this.name = 'ApiHttpError';
  }
}

interface ApiClientConfig {
  baseUrl: string;
  getAccessToken: GetAccessToken;
}

let clientConfig: ApiClientConfig | null = null;

/** Call from App.tsx after login — connects to your existing JWT storage. */
export function configureApiClient(config: ApiClientConfig): void {
  clientConfig = {
    baseUrl: config.baseUrl.replace(/\/$/, ''),
    getAccessToken: config.getAccessToken,
  };
}

export function getApiClientConfig(): ApiClientConfig {
  if (!clientConfig) {
    throw new Error(
      'ApiClient not configured. Call configureApiClient({ baseUrl, getAccessToken }) at startup.',
    );
  }
  return clientConfig;
}

async function resolveAccessToken(): Promise<string> {
  const { getAccessToken } = getApiClientConfig();
  const token = await getAccessToken();
  if (!token?.trim()) {
    throw new ApiAuthError('No JWT token available — user must be logged in');
  }
  return token.trim();
}

/** Builds headers with mandatory Bearer JWT for every API call. */
export async function buildAuthHeaders(
  extra?: Record<string, string>,
): Promise<Record<string, string>> {
  const token = await resolveAccessToken();
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
    ...extra,
  };
}

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 500;

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface ApiRequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** Skip retry on 5xx/network (default: true for GET, false for mutations). */
  retry?: boolean;
}

/**
 * Authenticated fetch to `/api/*`.
 * @param path e.g. `/screen-events` (leading slash required)
 */
export async function apiRequest<T>(
  path: string,
  options: ApiRequestOptions = {},
): Promise<T> {
  const { baseUrl } = getApiClientConfig();
  const { method = 'GET', body, retry = method === 'GET' } = options;
  const url = `${baseUrl}/api${path.startsWith('/') ? path : `/${path}`}`;

  let lastError: Error | undefined;
  const attempts = retry ? MAX_RETRIES : 1;

  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const headers = await buildAuthHeaders();
      const response = await fetch(url, {
        method,
        headers,
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });

      if (response.status === 401) {
        throw new ApiAuthError('Session expired or invalid token');
      }

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new ApiHttpError(
          response.status,
          `HTTP ${response.status}: ${text || response.statusText}`,
          text,
        );
      }

      if (response.status === 204) {
        return undefined as T;
      }

      return (await response.json()) as T;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (err instanceof ApiAuthError) throw err;
      if (attempt < attempts - 1) {
        await sleep(BASE_DELAY_MS * 2 ** attempt);
      }
    }
  }

  throw lastError ?? new Error(`API request failed: ${method} ${path}`);
}

export const api = {
  get: <T>(path: string) => apiRequest<T>(path, { method: 'GET' }),
  post: <T>(path: string, body: unknown) => apiRequest<T>(path, { method: 'POST', body }),
  put: <T>(path: string, body: unknown) => apiRequest<T>(path, { method: 'PUT', body }),
  patch: <T>(path: string, body: unknown) => apiRequest<T>(path, { method: 'PATCH', body }),
  delete: <T>(path: string) => apiRequest<T>(path, { method: 'DELETE' }),
};
