import {useEffect, useRef, useCallback} from 'react';
import {AppState, type AppStateStatus} from 'react-native';
import {tokenStorage} from '../auth/tokenStorage';
import {ApiAuthError} from '../services/apiClient';
import {
  postUsageSessions,
  type UsageSessionPayload,
} from '../services/usageApi';
import {scError, scLog, scWarn} from '../utils/screenCaptureLogger';

const APP_PACKAGE = 'com.mobileapp';
const FLUSH_INTERVAL_MS = 60_000;

/**
 * Sprint 2 MVP: tracks foreground time of the parental-control app via AppState.
 * Per-app tracking via UsageStatsManager is planned for a later iteration.
 */
export function useForegroundTracker(enabled: boolean): void {
  const foregroundStartRef = useRef<Date | null>(null);
  const batchRef = useRef<UsageSessionPayload[]>([]);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const sendBatch = useCallback(async () => {
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
      scLog(`[Usage] Sent ${result.count} session(s) to backend`);
    } catch (error) {
      if (error instanceof ApiAuthError) {
        scWarn('[Usage] Auth failed — batch kept for retry', {
          message: error.message,
        });
        batchRef.current = [...payload, ...batchRef.current];
        return;
      }
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('Network request failed')) {
        scWarn('[Usage] Backend unreachable — batch kept for retry', { message });
        batchRef.current = [...payload, ...batchRef.current];
        return;
      }
      scError('[Usage] Failed to send batch', error);
      batchRef.current = [...payload, ...batchRef.current];
    }
  }, []);

  const pushSession = useCallback((start: Date, end: Date) => {
    if (end.getTime() <= start.getTime()) {
      return;
    }
    batchRef.current.push({
      startTime: start.toISOString(),
      endTime: end.toISOString(),
      appPackage: APP_PACKAGE,
      appCategory: 'unknown',
    });
  }, []);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const handleAppStateChange = (nextState: AppStateStatus) => {
      const now = new Date();
      if (nextState === 'active' && foregroundStartRef.current === null) {
        foregroundStartRef.current = now;
        return;
      }
      if (nextState !== 'active' && foregroundStartRef.current) {
        pushSession(foregroundStartRef.current, now);
        foregroundStartRef.current = null;
        void sendBatch();
      }
    };

    if (AppState.currentState === 'active') {
      foregroundStartRef.current = new Date();
    }

    const subscription = AppState.addEventListener(
      'change',
      handleAppStateChange,
    );
    intervalRef.current = setInterval(() => {
      void sendBatch();
    }, FLUSH_INTERVAL_MS);

    return () => {
      subscription.remove();
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      if (foregroundStartRef.current) {
        pushSession(foregroundStartRef.current, new Date());
        foregroundStartRef.current = null;
      }
      void sendBatch();
    };
  }, [enabled, pushSession, sendBatch]);
}
