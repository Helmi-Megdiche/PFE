import { useCallback, useEffect, useState } from 'react';
import { tokenStorage } from './tokenStorage';

const DEV_TOKEN_RETRY_MS = 15_000;

/**
 * Fetches GET /api/dev/child-token in development when no JWT is stored.
 */
export function useDevChildToken(apiBaseUrl: string): {
  ready: boolean;
  error: string | null;
  hasToken: boolean;
  retry: () => void;
} {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasToken, setHasToken] = useState(false);
  const [attempt, setAttempt] = useState(0);

  const retry = useCallback(() => {
    setAttempt((n) => n + 1);
  }, []);

  useEffect(() => {
    if (!__DEV__) {
      void tokenStorage.getToken().then((token) => {
        setHasToken(!!token?.trim());
        setReady(true);
      });
      return;
    }

    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const loadDevToken = async (): Promise<void> => {
      try {
        const existing = await tokenStorage.getToken();
        if (existing?.trim()) {
          if (!cancelled) {
            setHasToken(true);
            setError(null);
            setReady(true);
          }
          return;
        }

        const response = await fetch(`${apiBaseUrl.replace(/\/$/, '')}/api/dev/child-token`);
        if (!response.ok) {
          throw new Error(`Dev token request failed: HTTP ${response.status}`);
        }

        const data = (await response.json()) as { token: string; childId?: string };
        await tokenStorage.setToken(data.token);
        if (data.childId) {
          await tokenStorage.setChildId(data.childId);
        }
        if (!cancelled) {
          setHasToken(true);
          setError(null);
          setReady(true);
        }
      } catch (err) {
        if (cancelled) return;
        setHasToken(false);
        setError(err instanceof Error ? err.message : String(err));
        setReady(true);
        retryTimer = setTimeout(() => {
          if (!cancelled) setAttempt((n) => n + 1);
        }, DEV_TOKEN_RETRY_MS);
      }
    };

    void loadDevToken();

    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [apiBaseUrl, attempt]);

  return { ready, error, hasToken, retry };
}
