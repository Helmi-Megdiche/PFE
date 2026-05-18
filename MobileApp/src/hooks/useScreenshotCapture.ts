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
  combineRiskScores,
  computeOcrRiskScore,
  resolveCombinedCategory,
} from '../utils/riskCombination';
import { scError, scLog, scWarn } from '../utils/screenCaptureLogger';
import { toMlKitImageUri } from '../utils/imageUri';
import type {
  CaptureCycleResult,
  ScreenEventPayload,
  ScreenshotCaptureConfig,
} from '../types/screenMonitor';

const DEFAULT_INTERVAL_MS = 30_000;
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
  const { intervalMs = DEFAULT_INTERVAL_MS, maxTextLength = DEFAULT_MAX_TEXT, onCycleComplete } =
    options;

  const [isMonitoring, setIsMonitoring] = useState(false);
  const [permissionGranted, setPermissionGranted] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [lastCaptureAt, setLastCaptureAt] = useState<string | null>(null);
  const [isPaused, setIsPaused] = useState(false);

  const isProcessingRef = useRef(false);
  const isStartingRef = useRef(false);
  const isMonitoringRef = useRef(false);

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

        scLog('Image classification', {
          source: imageClassification.source,
          imageRiskScore: imageClassification.imageRiskScore,
          violence: imageClassification.violenceScore.toFixed(2),
          adult: imageClassification.adultScore.toFixed(2),
        });

        const ocrRiskScore = computeOcrRiskScore(
          keywordResult.riskFlag,
          keywordResult.category,
          keywordResult.matchedKeywords.length,
        );
        const combinedRiskScore = combineRiskScores(
          ocrRiskScore,
          imageClassification.imageRiskScore,
        );
        const finalRiskFlag = combinedRiskScore > 50;
        const finalCategory = resolveCombinedCategory(
          imageClassification,
          keywordResult.category,
        );

        const payload: ScreenEventPayload = {
          timestamp: new Date().toISOString(),
          appPackage: appPackage || 'unknown',
          extractedTextPreview: preview,
          riskFlag: finalRiskFlag,
          riskScore: combinedRiskScore,
          imageRiskScore: imageClassification.imageRiskScore,
          combinedRiskScore,
          imageClassificationDetails: imageClassification.imageClassificationDetails,
          category: finalCategory,
        };

        scLog('Combined risk', {
          ocrRiskScore,
          imageRiskScore: imageClassification.imageRiskScore,
          combinedRiskScore,
          finalRiskFlag,
          category: finalCategory,
        });

        await postScreenEvent(payload);
        scLog('POST /api/screen-events OK');
        setLastCaptureAt(payload.timestamp);
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
    scLog('startMonitoring() start', { intervalMs });
    await logNativeDebugState('before startMonitoring');

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
      await native.startCapture(intervalMs);
      await logNativeDebugState('after startCapture');

      setPermissionGranted(true);
      setIsMonitoring(true);
      setIsPaused(false);
      setLastError(null);
      scLog('startMonitoring() SUCCESS');
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
  }, [intervalMs, requestPermission]);

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

  // Continuous monitoring: no pause/resume on AppState — native FGS keeps MediaProjection alive.

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
    lastError,
    lastCaptureAt,
    requestPermission,
    startMonitoring,
    stopMonitoring,
    pauseCapture,
    resumeCapture,
  };
}
