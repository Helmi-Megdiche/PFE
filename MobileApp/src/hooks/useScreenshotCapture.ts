import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import TextRecognition from '@react-native-ml-kit/text-recognition';
import getScreenCaptureModule, {
  screenCaptureEmitter,
  SCREEN_CAPTURE_EVENTS,
  type ScreenCapturedEvent,
} from '../native/ScreenCapture';
import { keywordFilter } from '../utils/keywordFilter';
import { classifyImage } from '../services/imageClassifier';
import { postScreenEvent } from '../services/screenEventsApi';
import {
  applyExplicitOcrBoost,
  applyPostProcessingOverride,
  computeOcrRiskScore,
  enforceCategoryConsistency,
  resolveFinalCategoryWithScore,
} from '../utils/riskCombination';
import { scError, scLog, scWarn } from '../utils/screenCaptureLogger';
import { toMlKitImageUri } from '../utils/imageUri';
import {
  hasUsageAccess,
  openUsageAccessSettings,
  resolveForegroundApp,
} from '../native/ForegroundApp';
import type {
  CaptureCycleResult,
  ScreenEventPayload,
  ScreenshotCaptureConfig,
} from '../types/screenMonitor';

/** Native periodic safety net (Sprint 3.7). */
const PERIODIC_INTERVAL_MS = 60_000;
/** JS fallback only if no capture in this window. */
const PERIODIC_FALLBACK_GAP_MS = 40_000;
const APP_POLL_MS = 1_000;
const CAPTURE_DEBOUNCE_MS = 5_000;
const DEFAULT_MAX_TEXT = 500;

interface UseScreenshotCaptureOptions extends ScreenshotCaptureConfig {
  onCycleComplete?: (result: CaptureCycleResult) => void;
}

function truncateText(text: string, maxLen: number): string {
  const trimmed = text.replace(/\s+/g, ' ').trim();
  if (trimmed.length <= maxLen) {
    return trimmed;
  }
  // Stay within API max (500) — do not append "…" or Joi rejects the payload
  return trimmed.slice(0, maxLen);
}

async function logNativeDebugState(label: string): Promise<void> {
  try {
    const state = await getScreenCaptureModule().getDebugState();
    scLog(`Native state @ ${label}`, state);
  } catch (err) {
    scWarn(`getDebugState failed @ ${label}`, err);
  }
}

export function useScreenshotCapture(options: UseScreenshotCaptureOptions = {}) {
  const {
    intervalMs = PERIODIC_INTERVAL_MS,
    maxTextLength = DEFAULT_MAX_TEXT,
    onCycleComplete,
  } = options;

  const [isMonitoring, setIsMonitoring] = useState(false);
  const [permissionGranted, setPermissionGranted] = useState(false);
  const [usageAccessGranted, setUsageAccessGranted] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [lastCaptureAt, setLastCaptureAt] = useState<string | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [lastForegroundApp, setLastForegroundApp] = useState<string | null>(null);

  const isProcessingRef = useRef(false);
  const isStartingRef = useRef(false);
  const isMonitoringRef = useRef(false);
  const lastCaptureMsRef = useRef(0);
  const lastAppPackageRef = useRef<string | null>(null);

  useEffect(() => {
    isMonitoringRef.current = isMonitoring;
  }, [isMonitoring]);

  // Forward native Android logs to Metro
  useEffect(() => {
    if (Platform.OS !== 'android') {
      return undefined;
    }
    const logSub = screenCaptureEmitter.addListener(
      SCREEN_CAPTURE_EVENTS.log,
      (event: { message: string }) => {
        scLog(`[Native] ${event.message}`);
      },
    );
    scLog('Hook mounted — listening for native logs');
    void logNativeDebugState('mount');
    return () => {
      logSub.remove();
      scLog('Hook unmounted');
    };
  }, []);

  const processCapturedFrame = useCallback(
    async (event: ScreenCapturedEvent): Promise<CaptureCycleResult> => {
      if (isProcessingRef.current) {
        scWarn('Frame skipped — OCR already in progress');
        return { success: false, skippedReason: 'ocr' };
      }

      isProcessingRef.current = true;
      const { filePath, imageUri, appPackage } = event;
      const ocrInput = toMlKitImageUri(imageUri ?? filePath);
      scLog('Frame received', { filePath, imageUri: ocrInput, appPackage });

      try {
        const fg =
          Platform.OS === 'android'
            ? await resolveForegroundApp()
            : { packageName: 'unknown', appLabel: 'unknown', source: 'none' as const };

        const resolvedPackage =
          fg.packageName && fg.packageName !== 'unknown'
            ? fg.packageName
            : appPackage && appPackage !== 'unknown'
              ? appPackage
              : 'unknown';
        const resolvedLabel =
          fg.appLabel && fg.appLabel !== 'unknown' ? fg.appLabel : resolvedPackage;

        scLog('Foreground app', {
          package: resolvedPackage,
          label: resolvedLabel,
          source: fg.source,
        });
        setLastForegroundApp(resolvedPackage);

        const [ocrResult, imageClassification] = await Promise.all([
          TextRecognition.recognize(ocrInput),
          classifyImage(ocrInput, filePath),
        ]);

        const fullText = ocrResult.text ?? '';
        const preview = truncateText(fullText, maxTextLength);
        scLog('OCR done', { chars: preview.length, preview: preview.slice(0, 80) });

        const keywordResult = keywordFilter(preview);
        scLog('Keyword filter', {
          riskFlag: keywordResult.riskFlag,
          category: keywordResult.category,
        });

        const visionScore =
          imageClassification.imageClassificationDetails?.imageRiskScore ??
          imageClassification.imageRiskScore;

        scLog('Image classification', {
          source: imageClassification.source,
          imageRiskScore: visionScore,
          violence: imageClassification.violenceScore.toFixed(2),
          adult: imageClassification.adultScore.toFixed(2),
        });

        const ocrRiskScore = computeOcrRiskScore(
          keywordResult.riskFlag,
          keywordResult.category,
          keywordResult.matchedKeywords.length,
        );
        let imageRiskScore =
          imageClassification.imageClassificationDetails?.imageRiskScore ??
          imageClassification.imageRiskScore;

        const boosted = applyExplicitOcrBoost(
          ocrRiskScore,
          imageRiskScore,
          keywordResult.category,
          imageClassification.adultScore,
        );
        imageRiskScore = boosted.imageRiskScore;
        let combinedRiskScore = boosted.combinedRiskScore;

        const postProcessed = applyPostProcessingOverride({
          combinedRiskScore,
          finalCategory: resolveFinalCategoryWithScore(
            combinedRiskScore,
            keywordResult.riskFlag,
            imageClassification,
            keywordResult.category,
            imageClassification.imageClassificationDetails?.mappedCategory,
          ),
          ocrCategory: keywordResult.category,
          keywordRiskFlag: keywordResult.riskFlag,
          matchedKeywords: keywordResult.matchedKeywords,
        });
        combinedRiskScore = postProcessed.combinedRiskScore;

        const finalRiskFlag = combinedRiskScore > 50;
        const finalCategory = enforceCategoryConsistency(
          combinedRiskScore,
          finalRiskFlag,
          postProcessed.finalCategory,
          imageClassification,
          keywordResult.category,
        );

        const payload: ScreenEventPayload = {
          timestamp: new Date().toISOString(),
          appPackage: resolvedPackage,
          appLabel: resolvedLabel,
          extractedTextPreview: preview,
          riskFlag: finalRiskFlag,
          riskScore: combinedRiskScore,
          imageRiskScore,
          combinedRiskScore,
          imageClassificationDetails: imageClassification.imageClassificationDetails,
          category: finalCategory,
        };

        scLog('Combined risk', {
          ocrRiskScore,
          imageRiskScore,
          combinedRiskScore,
          finalRiskFlag,
          category: finalCategory,
        });

        await postScreenEvent(payload);
        scLog('POST /api/screen-events OK');
        setLastCaptureAt(payload.timestamp);
        lastCaptureMsRef.current = Date.now();
        setLastError(null);

        return { success: true, event: payload };
      } catch (err) {
        scError('processCapturedFrame failed', err);
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
    scLog('requestPermission() start');
    await logNativeDebugState('before requestPermission');
    try {
      const native = getScreenCaptureModule();
      const alreadyGranted = await native.isPermissionGranted();
      scLog('isPermissionGranted (pre-check)', { alreadyGranted });
      if (alreadyGranted) {
        setPermissionGranted(true);
        await logNativeDebugState('already granted');
        return true;
      }

      scLog('Launching system MediaProjection dialog…');
      const granted = await native.requestPermission();
      scLog('requestPermission() result', { granted });
      await logNativeDebugState('after requestPermission');

      setPermissionGranted(granted);
      if (!granted) {
        setLastError('MediaProjection permission denied');
        scWarn('User denied MediaProjection');
      } else {
        setLastError(null);
      }
      return granted;
    } catch (err) {
      scError('requestPermission() threw', err);
      await logNativeDebugState('requestPermission error');
      const message = err instanceof Error ? err.message : String(err);
      setLastError(message);
      return false;
    }
  }, []);

  const refreshUsageAccess = useCallback(async (): Promise<boolean> => {
    const ok = await hasUsageAccess();
    setUsageAccessGranted(ok);
    return ok;
  }, []);

  const tryCaptureNow = useCallback(async (reason: string): Promise<void> => {
    if (!isMonitoringRef.current || isProcessingRef.current) {
      return;
    }
    const now = Date.now();
    if (now - lastCaptureMsRef.current < CAPTURE_DEBOUNCE_MS) {
      scLog('Smart capture skipped (debounce)', { reason, elapsed: now - lastCaptureMsRef.current });
      return;
    }
    try {
      const triggered = await getScreenCaptureModule().captureNow();
      if (triggered) {
        scLog('Smart capture triggered', { reason });
      }
    } catch (err) {
      scWarn('captureNow failed', { reason, err });
    }
  }, []);

  const startMonitoring = useCallback(async (): Promise<boolean> => {
    if (Platform.OS !== 'android') {
      scWarn('startMonitoring: not Android');
      return false;
    }
    if (isStartingRef.current) {
      scWarn('startMonitoring: already starting');
      return false;
    }

    isStartingRef.current = true;
    const periodicMs = Math.max(PERIODIC_INTERVAL_MS, intervalMs);
    scLog('startMonitoring() start', { periodicMs, smartCapture: true });
    await logNativeDebugState('before startMonitoring');

    const usageOk = await refreshUsageAccess();
    if (!usageOk) {
      scWarn('Usage access not granted — foreground app may be approximate until enabled');
    }

    try {
      const native = getScreenCaptureModule();
      let granted = await native.isPermissionGranted();
      scLog('isPermissionGranted (startMonitoring)', { granted });

      if (!granted) {
        scLog('Permission missing — calling requestPermission()');
        granted = await requestPermission();
        scLog('After requestPermission', { granted });
      }

      if (!granted) {
        scWarn('startMonitoring aborted — no permission');
        return false;
      }

      await logNativeDebugState('before startCapture');
      scLog('Calling native startCapture()…');
      await native.startCapture(periodicMs);
      await logNativeDebugState('after startCapture');

      lastCaptureMsRef.current = 0;
      lastAppPackageRef.current = null;

      const initialFg = await resolveForegroundApp();
      lastAppPackageRef.current = initialFg.packageName;
      setLastForegroundApp(initialFg.packageName);

      setPermissionGranted(true);
      setIsMonitoring(true);
      setIsPaused(false);
      setLastError(null);
      scLog('startMonitoring() SUCCESS — app-switch poll + periodic fallback', {
        periodicMs,
        appPollMs: APP_POLL_MS,
      });
      return true;
    } catch (err) {
      scError('startMonitoring() failed', err);
      await logNativeDebugState('startMonitoring error');
      const message = err instanceof Error ? err.message : String(err);
      setLastError(message);
      setIsMonitoring(false);
      return false;
    } finally {
      isStartingRef.current = false;
    }
  }, [intervalMs, refreshUsageAccess, requestPermission]);

  const stopMonitoring = useCallback(async (): Promise<void> => {
    if (Platform.OS !== 'android') {
      return;
    }
    scLog('stopMonitoring()');
    try {
      await getScreenCaptureModule().stopCapture();
      scLog('stopCapture() OK');
    } catch (err) {
      scError('stopMonitoring failed', err);
      const message = err instanceof Error ? err.message : String(err);
      setLastError(message);
    }
    setIsMonitoring(false);
    setIsPaused(false);
    setPermissionGranted(false);
    await logNativeDebugState('after stopMonitoring');
  }, []);

  const pauseCapture = useCallback(async () => {
    if (Platform.OS !== 'android' || !isMonitoring) {
      return;
    }
    scLog('pauseCapture()');
    try {
      await getScreenCaptureModule().pauseCapture();
      setIsPaused(true);
    } catch (err) {
      scError('pauseCapture failed', err);
      setLastError(err instanceof Error ? err.message : String(err));
    }
  }, [isMonitoring]);

  const resumeCapture = useCallback(async () => {
    if (Platform.OS !== 'android' || !isMonitoring) {
      return;
    }
    scLog('resumeCapture()');
    try {
      await getScreenCaptureModule().resumeCapture();
      setIsPaused(false);
    } catch (err) {
      scError('resumeCapture failed', err);
      setLastError(err instanceof Error ? err.message : String(err));
    }
  }, [isMonitoring]);

  useEffect(() => {
    if (Platform.OS !== 'android') {
      return undefined;
    }

    const captureSub = screenCaptureEmitter.addListener(
      SCREEN_CAPTURE_EVENTS.captured,
      (event: ScreenCapturedEvent) => {
        if (!isMonitoringRef.current) {
          scWarn('Frame ignored — monitoring off');
          return;
        }
        void processCapturedFrame(event)
          .then(onCycleComplete)
          .catch((err) => scError('Frame handler error', err));
      },
    );

    const errorSub = screenCaptureEmitter.addListener(
      SCREEN_CAPTURE_EVENTS.error,
      (event: { message: string }) => {
        scError('Native error event', event.message);
        setLastError(event.message);
      },
    );

    return () => {
      captureSub.remove();
      errorSub.remove();
    };
  }, [onCycleComplete, processCapturedFrame]);

  // Smart capture: poll foreground app (1s) + periodic fallback (60s if idle 40s+).
  useEffect(() => {
    if (!isMonitoring || Platform.OS !== 'android') {
      return undefined;
    }

    const appPollId = setInterval(() => {
      void (async () => {
        const fg = await resolveForegroundApp();
        const pkg = fg.packageName;
        if (
          lastAppPackageRef.current !== null &&
          pkg !== 'unknown' &&
          pkg !== lastAppPackageRef.current
        ) {
          scLog('App switch detected', {
            from: lastAppPackageRef.current,
            to: pkg,
            label: fg.appLabel,
          });
          await tryCaptureNow('app_switch');
        }
        if (pkg !== 'unknown') {
          lastAppPackageRef.current = pkg;
          setLastForegroundApp(pkg);
        }
      })();
    }, APP_POLL_MS);

    const periodicId = setInterval(() => {
      const elapsed = Date.now() - lastCaptureMsRef.current;
      if (lastCaptureMsRef.current === 0 || elapsed >= PERIODIC_FALLBACK_GAP_MS) {
        void tryCaptureNow('periodic_fallback');
      }
    }, PERIODIC_INTERVAL_MS);

    scLog('Smart capture timers started');
    return () => {
      clearInterval(appPollId);
      clearInterval(periodicId);
      scLog('Smart capture timers stopped');
    };
  }, [isMonitoring, tryCaptureNow]);

  useEffect(() => {
    return () => {
      scLog('Cleanup — stopMonitoring on unmount');
      void stopMonitoring();
    };
  }, [stopMonitoring]);

  return {
    isMonitoring,
    isPaused,
    permissionGranted,
    usageAccessGranted,
    lastForegroundApp,
    lastError,
    lastCaptureAt,
    requestPermission,
    refreshUsageAccess,
    openUsageAccessSettings,
    startMonitoring,
    stopMonitoring,
    pauseCapture,
    resumeCapture,
  };
}
