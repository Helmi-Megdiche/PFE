import { useCallback, useEffect, useState } from 'react';
import { tokenStorage } from './tokenStorage';
import { decodeJwtPayload } from './jwtUtils';

export function useChildId(): {
  childId: string | null;
  loading: boolean;
  refresh: () => void;
} {
  const [childId, setChildId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(() => {
    setLoading(true);
    void (async () => {
      const stored = await tokenStorage.getChildId();
      if (stored?.trim()) {
        setChildId(stored.trim());
        setLoading(false);
        return;
      }
      const token = await tokenStorage.getToken();
      const payload = token ? decodeJwtPayload(token) : null;
      const id = payload?.childId ?? null;
      if (id) {
        await tokenStorage.setChildId(id);
      }
      setChildId(id);
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { childId, loading, refresh };
}
