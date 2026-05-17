import { configureApiClient, type GetAccessToken } from '../services/apiClient';

/**
 * Initialize the API client at app startup (e.g. in App.tsx or after login).
 *
 * @example
 * setupAuthenticatedApi({
 *   baseUrl: Config.API_URL,
 *   getAccessToken: () => tokenStorage.getToken(),
 * });
 */
export function setupAuthenticatedApi(options: {
  baseUrl: string;
  getAccessToken: GetAccessToken;
}): void {
  configureApiClient({
    baseUrl: options.baseUrl,
    getAccessToken: options.getAccessToken,
  });
}
