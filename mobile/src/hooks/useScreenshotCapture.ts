import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, AppStateStatus, Platform } from 'react-native';
import TextRecognition from '@react-native-ml-kit/text-recognition';
import getScreenCaptureModule, {
  screenCaptureEmitter,
  SCREEN_CAPTURE_EVENTS,
  type ScreenCapturedEvent,
} from '../native/ScreenCapture';
import { keywordFilter } from '../utils/keywordFilter';
import { postScreenEvent } from '../services/screenEventsApi';
import type {
  CaptureCycleResult,
  ScreenEventPayload,
  ScreenshotCaptureConfig,
} from '../types/screenMonitor';

const DEFAULT_INTERVAL_MS = 30_000;
const DEFAULT_MAX_TEXT = 500;

interface UseScreenshotCaptureOptions extends ScreenshotCaptureConfig {
  enabled: boolean;
  onCycleComplete?: (result: CaptureCycleResult) => void;
}

function truncateText(text: string, maxLen: number): string {
  const trimmed = text.replace(/\s+/g, ' ').trim();
  return trimmed.length <= maxLen ? trimmed : `${trimmed.slice(0, maxLen)}…`;
}

/**
 * Real screen capture via Java MediaProjection module.
 * Each native frame → ML Kit OCR → keyword filter → POST /api/screen-events (JWT via apiClient).
 */
export function useScreenshotCapture(options: UseScreenshotCaptureOptions) {
  const {
    enabled,
    intervalMs = DEFAULT_INTERVAL_MS,
    maxTextLength = DEFAULT_MAX_TEXT,
    onCycleComplete,
  } = options;

  const [isMonitoring, setIsMonitoring] = useState(false);
  const [permissionGranted, setPermissionGranted] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [lastCaptureAt, setLastCaptureAt] = useState<string | null>(null);
  const [isPaused, setIsPaused] = useState(false);

  const isProcessingRef = useRef(false);
  const enabledRef = useRef(enabled);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  const processCapturedFrame = useCallback(
    async (event: ScreenCapturedEvent): Promise<CaptureCycleResult> => {
      if (isProcessingRef.current) {
        return { success: false, skippedReason: 'ocr' };
      }

      isProcessingRef.current = true;
      const { filePath, appPackage } = event;

      try {
        const ocrResult = await TextRecognition.recognize(filePath);
        const fullText = ocrResult.text ?? '';
        const preview = truncateText(fullText, maxTextLength);
        const { riskFlag, category } = keywordFilter(preview);

        const payload: ScreenEventPayload = {
          timestamp: new Date().toISOString(),
          appPackage: appPackage || 'unknown',
          extractedTextPreview: preview,
          riskFlag,
          riskScore: riskFlag ? 75 : null,
          category: riskFlag ? category : 'neutral',
        };

        await postScreenEvent(payload);
        setLastCaptureAt(payload.timestamp);
        setLastError(null);

        return { success: true, event: payload };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (message.toLowerCase().includes('storage')) {
          return { success: false, skippedReason: 'storage', error: message };
        }
        setLastError(message);
        return { success: false, error: message };
      } finally {
        await getScreenCaptureModule().deleteFile(filePath).catch(() => undefined);
        isProcessingRef.current = false;
      }
    },
    [maxTextLength],
  );

  const requestPermission = useCallback(async (): Promise<boolean> => {
    if (Platform.OS !== 'android') {
      setLastError('Screen monitoring is only supported on Android');
      return false;
    }
    try {
      const granted = await getScreenCaptureModule().requestPermission();
      setPermissionGranted(granted);
      if (!granted) {
        setLastError('MediaProjection permission denied');
      }
      return granted;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setLastError(message);
      return false;
    }
  }, []);

  const startMonitoring = useCallback(async () => {
    if (Platform.OS !== 'android') return;

    const granted =
      permissionGranted ||
      (await getScreenCaptureModule().isPermissionGranted()) ||
      (await requestPermission());

    if (!granted) return;

    await getScreenCaptureModule().startCapture(intervalMs);
    setIsMonitoring(true);
    setIsPaused(false);
  }, [intervalMs, permissionGranted, requestPermission]);

  const stopMonitoring = useCallback(async () => {
    if (Platform.OS !== 'android') return;
    try {
      await getScreenCaptureModule().stopCapture();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setLastError(message);
    }
    setIsMonitoring(false);
    setIsPaused(false);
  }, []);

  const pauseCapture = useCallback(async () => {
    if (Platform.OS !== 'android' || !isMonitoring) return;
    try {
      await getScreenCaptureModule().pauseCapture();
      setIsPaused(true);
    } catch (err) {
      setLastError(err instanceof Error ? err.message : String(err));
    }
  }, [isMonitoring]);

  const resumeCapture = useCallback(async () => {
    if (Platform.OS !== 'android' || !isMonitoring) return;
    try {
      await getScreenCaptureModule().resumeCapture();
      setIsPaused(false);
    } catch (err) {
      setLastError(err instanceof Error ? err.message : String(err));
    }
  }, [isMonitoring]);

  // Native frame callback (onScreenCaptured event)
  useEffect(() => {
    if (Platform.OS !== 'android') return undefined;

    const captureSub = screenCaptureEmitter.addListener(
      SCREEN_CAPTURE_EVENTS.captured,
      (event: ScreenCapturedEvent) => {
        if (!enabledRef.current) return;
        void processCapturedFrame(event)
          .then(onCycleComplete)
          .catch((err) => {
            const message = err instanceof Error ? err.message : String(err);
            setLastError(message);
          });
      },
    );

    const errorSub = screenCaptureEmitter.addListener(
      SCREEN_CAPTURE_EVENTS.error,
      (event: { message: string }) => {
        setLastError(event.message);
      },
    );

    return () => {
      captureSub.remove();
      errorSub.remove();
    };
  }, [onCycleComplete, processCapturedFrame]);

  // Pause when app goes to background; resume when active
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      appStateRef.current = next;
      if (!isMonitoring) return;
      if (next === 'active') {
        void resumeCapture();
      } else if (next === 'background' || next === 'inactive') {
        void pauseCapture();
      }
    });
    return () => sub.remove();
  }, [isMonitoring, pauseCapture, resumeCapture]);

  // Start/stop from enabled prop
  useEffect(() => {
    if (enabled && !isMonitoring) {
      void startMonitoring();
    }
    if (!enabled && isMonitoring) {
      void stopMonitoring();
    }
  }, [enabled, isMonitoring, startMonitoring, stopMonitoring]);

  useEffect(() => {
    return () => {
      void stopMonitoring();
    };
  }, [stopMonitoring]);

  return {
    isMonitoring,
    isPaused,
    permissionGranted,
    lastError,
    lastCaptureAt,
    requestPermission,
    startMonitoring,
    stopMonitoring,
    pauseCapture,
    resumeCapture,
  };
}
