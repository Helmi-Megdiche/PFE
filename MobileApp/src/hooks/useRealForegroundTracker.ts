import { useCallback, useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { tokenStorage } from '../auth/tokenStorage';
import { resolveForegroundApp } from '../native/ForegroundApp';
import { ApiAuthError } from '../services/apiClient';
import { postUsageSessions, type UsageSessionPayload } from '../services/usageApi';
import { scError, scLog, scWarn } from '../utils/screenCaptureLogger';
import { isTrackableForegroundPackage, mapCategoryForUsage } from '../utils/usageCategory';

const POLL_INTERVAL_MS = 5_000;
const FLUSH_INTERVAL_MS = 60_000;
const MIN_SESSION_MS = 3_000;

interface ActiveSession {
  appPackage: string;
  appCategory: string;
  startMs: number;
}

export function useRealForegroundTracker(enabled: boolean): void {
  const currentSessionRef = useRef<ActiveSession | null>(null);
  const batchRef = useRef<UsageSessionPayload[]>([]);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const flushTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startSession = useCallback((appPackage: string, appCategory: string) => {
    currentSessionRef.current = {
      appPackage,
      appCategory,
      startMs: Date.now(),
    };
    scLog('[Usage] Session started', { appPackage, appCategory });
  }, []);

  const endCurrentSession = useCallback((reason: string) => {
    const active = currentSessionRef.current;
    if (!active) {
      return;
    }

    const endMs = Date.now();
    const durationMs = endMs - active.startMs;
    currentSessionRef.current = null;

    if (durationMs < MIN_SESSION_MS) {
      scLog('[Usage] Dropped short session', {
        appPackage: active.appPackage,
        durationMs,
        reason,
      });
      return;
    }

    batchRef.current.push({
      startTime: new Date(active.startMs).toISOString(),
      endTime: new Date(endMs).toISOString(),
      appPackage: active.appPackage,
      appCategory: active.appCategory,
    });
    scLog('[Usage] Session queued', {
      appPackage: active.appPackage,
      appCategory: active.appCategory,
      durationMs,
      reason,
      queuedCount: batchRef.current.length,
    });
  }, []);

  const flushBatch = useCallback(async () => {
    if (batchRef.current.length === 0) {
      return;
    }

    const token = await tokenStorage.getToken();
    if (!token?.trim()) {
      scWarn('[Usage] Skipping batch — no JWT (start backend or log in)');
      return;
    }

    const payload = [...batchRef.current];
    batchRef.current = [];

    try {
      const result = await postUsageSessions(payload);
      scLog('[Usage] Sent sessions batch', {
        sent: result.count,
        attempted: payload.length,
      });
    } catch (error) {
      if (error instanceof ApiAuthError) {
        scWarn('[Usage] Auth failed — batch kept for retry', {
          message: error.message,
          count: payload.length,
        });
        batchRef.current = [...payload, ...batchRef.current];
        return;
      }

      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('Network request failed')) {
        scWarn('[Usage] Backend unreachable — batch kept for retry', {
          message,
          count: payload.length,
        });
        batchRef.current = [...payload, ...batchRef.current];
        return;
      }

      scError('[Usage] Failed to send usage batch', error);
      batchRef.current = [...payload, ...batchRef.current];
    }
  }, []);

  const pollForeground = useCallback(async () => {
    if (!enabled) {
      return;
    }

    try {
      const fg = await resolveForegroundApp();
      const pkg = fg.packageName;
      if (!isTrackableForegroundPackage(pkg)) {
        endCurrentSession('untrackable_foreground');
        return;
      }

      const appCategory = mapCategoryForUsage(pkg);
      if (!appCategory) {
        endCurrentSession('system_category');
        return;
      }

      const active = currentSessionRef.current;
      if (!active) {
        startSession(pkg, appCategory);
        return;
      }

      if (active.appPackage !== pkg) {
        endCurrentSession('app_switch');
        startSession(pkg, appCategory);
      }
    } catch (error) {
      scWarn('[Usage] Foreground poll failed', error);
    }
  }, [enabled, endCurrentSession, startSession]);

  useEffect(() => {
    if (!enabled) {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
      if (flushTimerRef.current) {
        clearInterval(flushTimerRef.current);
        flushTimerRef.current = null;
      }
      endCurrentSession('tracker_disabled');
      void flushBatch();
      return;
    }

    scLog('[Usage] Real foreground tracker enabled');
    void pollForeground();

    pollTimerRef.current = setInterval(() => {
      void pollForeground();
    }, POLL_INTERVAL_MS);

    flushTimerRef.current = setInterval(() => {
      void flushBatch();
    }, FLUSH_INTERVAL_MS);

    const subscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        void pollForeground();
        return;
      }
      endCurrentSession(`appstate_${nextState}`);
      void flushBatch();
    });

    return () => {
      subscription.remove();
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
      if (flushTimerRef.current) {
        clearInterval(flushTimerRef.current);
        flushTimerRef.current = null;
      }
      endCurrentSession('tracker_unmount');
      void flushBatch();
      scLog('[Usage] Real foreground tracker disabled');
    };
  }, [enabled, endCurrentSession, flushBatch, pollForeground]);
}
