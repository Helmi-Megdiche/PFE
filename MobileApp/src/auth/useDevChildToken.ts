import { useEffect, useState } from 'react';
import { tokenStorage } from './tokenStorage';

/**
 * Fetches GET /api/dev/child-token in development when no JWT is stored.
 */
export function useDevChildToken(apiBaseUrl: string): { ready: boolean; error: string | null } {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!__DEV__) {
      setReady(true);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const existing = await tokenStorage.getToken();
        if (existing) {
          if (!cancelled) setReady(true);
          return;
        }

        const response = await fetch(`${apiBaseUrl.replace(/\/$/, '')}/api/dev/child-token`);
        if (!response.ok) {
          throw new Error(`Dev token request failed: HTTP ${response.status}`);
        }

        const data = (await response.json()) as { token: string };
        await tokenStorage.setToken(data.token);
        if (!cancelled) setReady(true);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
          setReady(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [apiBaseUrl]);

  return { ready, error };
}
