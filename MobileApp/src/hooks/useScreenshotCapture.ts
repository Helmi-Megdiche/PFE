import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import getScreenCaptureModule, {
  screenCaptureEmitter,
  SCREEN_CAPTURE_EVENTS,
  type ScreenCapturedEvent,
} from '../native/ScreenCapture';
import { keywordFilter } from '../utils/keywordFilter';
import { classifyImage } from '../services/imageClassifier';
import { extractTextMixed } from '../services/mixedScriptOcr';
import { postScreenEvent } from '../services/screenEventsApi';
import { clearStaleNotificationMissionLaunch } from '../missions/missionNotificationLaunch';
import { presentMissionFromCapture } from '../missions/presentMissionFromCapture';
import { withTimeout } from '../utils/withTimeout';
import {
  applyExplicitOcrBoost,
  applyPostProcessingOverride,
  computeOcrRiskScore,
  enforceCategoryConsistency,
  resolveFinalCategoryWithScore,
} from '../utils/riskCombination';
import {
  computeAdaptiveIntervalMs,
  computeEffectiveAdaptiveInterval,
  pushRiskScore,
  RISK_INTERVAL_LOW_MS,
} from '../utils/adaptiveCapture';
import { getAppCategory, isLauncherPackage, type AppCategory } from '../utils/appCapturePolicy';
import { shouldNeutralizeLauncherWidgetCapture } from '../utils/launcherCaptureContext';
import {
  markMonitoringStarted,
  resetMissionPresentationGuard,
  shouldPresentMissionFromCapture,
} from '../utils/missionPresentationGuard';
import { scError, scLog, scWarn } from '../utils/screenCaptureLogger';
import { detectCaptureQuality } from '../utils/captureQuality';
import { isDevOverlayOcrText } from '../utils/devOverlayOcr';
import { shouldSkipScreenEventReporting } from '../utils/benignRiskContext';
import { toMlKitImageUri } from '../utils/imageUri';
import { setLastCapturePath } from '../utils/lastCapturePath';
import {
  hasUsageAccess,
  openUsageAccessSettings,
  resolveForegroundApp,
  resolveForegroundAppWithRetry,
} from '../native/ForegroundApp';
import {
  isMissionCapturePaused,
  registerMissionCaptureHandlers,
  resetMissionCaptureSession,
  unregisterMissionCaptureHandlers,
} from '../utils/missionCaptureSession';
import type {
  CaptureCycleResult,
  ScreenEventPayload,
  ScreenshotCaptureConfig,
} from '../types/screenMonitor';

const APP_POLL_MS = 1_000;
const CAPTURE_DEBOUNCE_MS = 5_000;
const FOLLOW_UP_DELAY_MS = 5_000;
/** Skip follow-up if a capture completed within this window. */
const FOLLOW_UP_MIN_GAP_MS = 2_000;
const DEFAULT_MAX_TEXT = 500;

/** Never cache or report System UI / launchers — they stick after consent or home. */
const SYSTEM_UI_PACKAGE = 'com.android.systemui';

/** Max age for cached foreground package when live lookup fails at capture time. */
const FOREGROUND_CACHE_MAX_AGE_MS = 15_000;

function isUsableForegroundPackage(pkg: string | null | undefined): pkg is string {
  if (!pkg || pkg === 'unknown' || pkg === SYSTEM_UI_PACKAGE) {
    return false;
  }
  if (pkg.includes('launcher')) {
    return false;
  }
  return true;
}

interface UseScreenshotCaptureOptions extends ScreenshotCaptureConfig {
  onCycleComplete?: (result: CaptureCycleResult) => void;
}

function truncateText(text: string, maxLen: number): string {
  const trimmed = text.replace(/\s+/g, ' ').trim();
  if (trimmed.length <= maxLen) {
    return trimmed;
  }
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
    intervalMs = RISK_INTERVAL_LOW_MS,
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
  const [dynamicIntervalMs, setDynamicIntervalMs] = useState(RISK_INTERVAL_LOW_MS);
  const [appCategory, setAppCategory] = useState<AppCategory | null>(null);
  const [avgRiskScore, setAvgRiskScore] = useState<number | null>(null);

  const isProcessingRef = useRef(false);
  const isStartingRef = useRef(false);
  const isMonitoringRef = useRef(false);
  const lastCaptureMsRef = useRef(0);
  const lastAppPackageRef = useRef<string | null>(null);
  const lastAppPackageUpdatedAtRef = useRef(0);

  const riskHistoryRef = useRef<number[]>([]);
  const dynamicIntervalMsRef = useRef(RISK_INTERVAL_LOW_MS);
  const periodicTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const followUpTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const appPollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    isMonitoringRef.current = isMonitoring;
  }, [isMonitoring]);

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

  const clearPeriodicTimer = useCallback(() => {
    if (periodicTimerRef.current) {
      clearTimeout(periodicTimerRef.current);
      periodicTimerRef.current = null;
    }
  }, []);

  const clearAdaptiveTimers = useCallback(() => {
    clearPeriodicTimer();
    if (followUpTimerRef.current) {
      clearTimeout(followUpTimerRef.current);
      followUpTimerRef.current = null;
    }
    if (appPollTimerRef.current) {
      clearInterval(appPollTimerRef.current);
      appPollTimerRef.current = null;
    }
  }, [clearPeriodicTimer]);

  const tryCaptureNow = useCallback(async (reason: string): Promise<void> => {
    if (!isMonitoringRef.current || isProcessingRef.current) {
      return;
    }
    const now = Date.now();
    if (now - lastCaptureMsRef.current < CAPTURE_DEBOUNCE_MS) {
      scLog('Capture skipped (debounce)', {
        reason,
        elapsedMs: now - lastCaptureMsRef.current,
      });
      return;
    }
    try {
      const triggered = await getScreenCaptureModule().captureNow();
      if (triggered) {
        scLog('Capture triggered', { reason });
      }
    } catch (err) {
      scWarn('captureNow failed', { reason, err });
    }
  }, []);

  const resetPeriodicTimer = useCallback(() => {
    if (periodicTimerRef.current) {
      clearTimeout(periodicTimerRef.current);
      periodicTimerRef.current = null;
    }
    if (!isMonitoringRef.current) {
      return;
    }

    const scheduleTick = () => {
      const delay = dynamicIntervalMsRef.current;
      periodicTimerRef.current = setTimeout(() => {
        periodicTimerRef.current = null;
        if (!isMonitoringRef.current) {
          return;
        }
        void tryCaptureNow('periodic_adaptive').finally(() => {
          if (isMonitoringRef.current) {
            scheduleTick();
          }
        });
      }, delay);
    };

    scLog('Periodic adaptive timer (re)started', {
      intervalMs: dynamicIntervalMsRef.current,
    });
    scheduleTick();
  }, [tryCaptureNow]);

  const applyEffectiveInterval = useCallback(
    (reason: string) => {
      const pkg = lastAppPackageRef.current;
      const riskOnlyInterval = computeAdaptiveIntervalMs(riskHistoryRef.current);
      const effectiveInterval = computeEffectiveAdaptiveInterval(
        riskHistoryRef.current,
        pkg,
      );
      const category =
        pkg && isUsableForegroundPackage(pkg) ? getAppCategory(pkg) : null;
      setAppCategory(category);

      if (effectiveInterval === dynamicIntervalMsRef.current) {
        return;
      }

      dynamicIntervalMsRef.current = effectiveInterval;
      setDynamicIntervalMs(effectiveInterval);

      const avg =
        riskHistoryRef.current.length > 0
          ? Math.round(
              riskHistoryRef.current.reduce((sum, s) => sum + s, 0) /
                riskHistoryRef.current.length,
            )
          : null;
      if (avg != null) {
        setAvgRiskScore(avg);
      }

      scLog('Adaptive interval changed', {
        reason,
        avgRisk: avg,
        history: [...riskHistoryRef.current],
        appPackage: pkg,
        appCategory: category,
        riskOnlyIntervalMs: riskOnlyInterval,
        effectiveIntervalMs: effectiveInterval,
      });

      if (effectiveInterval === 0) {
        clearPeriodicTimer();
      } else {
        resetPeriodicTimer();
      }
    },
    [clearPeriodicTimer, resetPeriodicTimer],
  );

  const updateRiskAndInterval = useCallback(
    (newRiskScore: number) => {
      riskHistoryRef.current = pushRiskScore(riskHistoryRef.current, newRiskScore);
      const avg = Math.round(
        riskHistoryRef.current.reduce((sum, s) => sum + s, 0) /
          riskHistoryRef.current.length,
      );
      setAvgRiskScore(avg);
      applyEffectiveInterval('risk_score');
    },
    [applyEffectiveInterval],
  );

  const refreshIntervalForApp = useCallback(() => {
    applyEffectiveInterval('app_switch');
  }, [applyEffectiveInterval]);

  const scheduleFollowUpCapture = useCallback(
    (delayMs: number) => {
      if (followUpTimerRef.current) {
        clearTimeout(followUpTimerRef.current);
      }
      followUpTimerRef.current = setTimeout(() => {
        followUpTimerRef.current = null;
        const elapsed = Date.now() - lastCaptureMsRef.current;
        if (elapsed < FOLLOW_UP_MIN_GAP_MS) {
          scLog('Follow-up skipped — capture too recent', { elapsedMs: elapsed });
          return;
        }
        void tryCaptureNow('app_switch_follow_up');
      }, delayMs);
      scLog('Follow-up capture scheduled', { delayMs });
    },
    [tryCaptureNow],
  );

  const processCapturedFrame = useCallback(
    async (event: ScreenCapturedEvent): Promise<CaptureCycleResult> => {
      if (isMissionCapturePaused()) {
        scLog('Frame skipped — mission in progress');
        return { success: false, skippedReason: 'mission' };
      }

      if (isProcessingRef.current) {
        scWarn('Frame skipped — OCR already in progress');
        return { success: false, skippedReason: 'ocr' };
      }

      isProcessingRef.current = true;
      const { filePath, imageUri, appPackage } = event;
      setLastCapturePath(filePath);
      const ocrInput = toMlKitImageUri(imageUri ?? filePath);
      scLog('Frame received', { filePath, imageUri: ocrInput, appPackage });

      try {
        const fg =
          Platform.OS === 'android'
            ? await withTimeout(
                resolveForegroundAppWithRetry(3, 200),
                4_000,
                { packageName: 'unknown', appLabel: 'unknown', source: 'none' as const },
              )
            : { packageName: 'unknown', appLabel: 'unknown', source: 'none' as const };

        const fgPackage = isUsableForegroundPackage(fg.packageName) ? fg.packageName : null;
        const eventPackage = isUsableForegroundPackage(appPackage) ? appPackage : null;
        const cacheAgeMs = Date.now() - lastAppPackageUpdatedAtRef.current;
        const cachedPackage =
          isUsableForegroundPackage(lastAppPackageRef.current) &&
          cacheAgeMs <= FOREGROUND_CACHE_MAX_AGE_MS
            ? lastAppPackageRef.current
            : null;

        if (
          !fgPackage &&
          isUsableForegroundPackage(lastAppPackageRef.current) &&
          cacheAgeMs > FOREGROUND_CACHE_MAX_AGE_MS
        ) {
          scWarn('Foreground cache stale — live lookup failed; not reusing old app', {
            cached: lastAppPackageRef.current,
            cacheAgeMs,
          });
        }

        const resolvedPackage = fgPackage ?? eventPackage ?? cachedPackage ?? 'unknown';

        const resolvedLabel =
          fgPackage &&
          fg.appLabel &&
          fg.appLabel !== 'unknown' &&
          fgPackage === resolvedPackage
            ? fg.appLabel
            : resolvedPackage;

        if (fgPackage) {
          lastAppPackageRef.current = fgPackage;
          lastAppPackageUpdatedAtRef.current = Date.now();
        }

        scLog('Foreground app', {
          package: resolvedPackage,
          label: resolvedLabel,
          source: fgPackage
            ? fg.source
            : eventPackage === resolvedPackage
              ? 'capture_event'
              : cachedPackage === resolvedPackage
                ? 'cached_poll'
                : fg.source,
        });
        setLastForegroundApp(resolvedPackage);

        const [ocrMixed, imageClassification] = await Promise.all([
          extractTextMixed(ocrInput, { filePath, appPackage: resolvedPackage }),
          classifyImage(ocrInput, filePath),
        ]);

        const fullText = ocrMixed.text ?? '';
        const cleanedForKeywords = ocrMixed.cleanedText ?? fullText;
        const preview = truncateText(cleanedForKeywords, maxTextLength);
        const normalizedText = ocrMixed.normalizedText
          ? truncateText(ocrMixed.normalizedText, maxTextLength)
          : undefined;
        scLog('OCR done', {
          chars: preview.length,
          preview: preview.slice(0, 80),
          source: ocrMixed.source,
          ...(__DEV__
            ? { arabic: ocrMixed.hasArabicScript, arabizi: ocrMixed.hasArabiziPattern }
            : {}),
        });

        const devOverlayOcr = __DEV__ && isDevOverlayOcrText(fullText);
        if (devOverlayOcr) {
          scLog('OCR suppressed — React Native / Metro dev overlay detected');
        }

        const keywordResult = devOverlayOcr
          ? { riskFlag: false, category: 'educational' as const, matchedKeywords: [] as string[] }
          : keywordFilter(preview, normalizedText);

        if (keywordResult.riskFlag && __DEV__) {
          // eslint-disable-next-line no-console
          console.log('[Risk] Matched keywords:', keywordResult.matchedKeywords);
        }

        const ocrRiskScore = devOverlayOcr
          ? 0
          : computeOcrRiskScore(
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

        let finalRiskFlag = combinedRiskScore > 50;
        let finalCategory = enforceCategoryConsistency(
          combinedRiskScore,
          finalRiskFlag,
          postProcessed.finalCategory,
          imageClassification,
          keywordResult.category,
        );

        if (shouldNeutralizeLauncherWidgetCapture(resolvedPackage, cleanedForKeywords)) {
          scLog('Launcher recents/widget OCR — risk neutralized (open Chrome for enforcement)', {
            package: resolvedPackage,
            preview: preview.slice(0, 80),
          });
          finalRiskFlag = false;
          finalCategory = 'neutral';
          combinedRiskScore = Math.min(combinedRiskScore, 25);
        }

        const details = imageClassification.imageClassificationDetails ?? {};
        const captureQuality = detectCaptureQuality(
          details.mlKitLabels,
          imageClassification.adultScore ?? 0,
          fullText.length,
        );
        if (captureQuality === 'blank_or_protected') {
          scWarn(
            'Capture may be blank or protected (Incognito/DRM?) — TFLite saw little content; try normal Chrome tab + app-switch capture',
            { labels: details.mlKitLabels?.slice(0, 4) },
          );
        }

        if (shouldSkipScreenEventReporting(fullText)) {
          scLog('Screen event skipped — mission / game UI OCR');
          return;
        }

        if (!isMonitoringRef.current) {
          scLog('Screen event skipped — monitoring stopped during OCR');
          return;
        }

        const payload: ScreenEventPayload = {
          timestamp: new Date().toISOString(),
          appPackage: resolvedPackage,
          appLabel: resolvedLabel,
          extractedTextPreview: preview,
          riskFlag: finalRiskFlag,
          riskScore: combinedRiskScore,
          imageRiskScore,
          combinedRiskScore,
          imageClassificationDetails: {
            ...details,
            captureQualityHint: captureQuality,
          },
          category: finalCategory,
        };

        scLog('Combined risk', {
          ocrRiskScore,
          imageRiskScore,
          combinedRiskScore,
          finalRiskFlag,
          category: finalCategory,
        });

        const screenEventResponse = await postScreenEvent(payload);
        scLog('POST /api/screen-events OK');
        if (screenEventResponse.newMission?.id) {
          const nm = screenEventResponse.newMission;
          if (isLauncherPackage(resolvedPackage)) {
            scLog('Mission presentation skipped — home/launcher foreground', {
              missionId: nm.id,
              package: resolvedPackage,
            });
          } else if (
            shouldPresentMissionFromCapture(nm.id, { reSurfaced: nm.reSurfaced })
          ) {
            scLog('New mission from screen event — presenting mission UI', {
              missionId: nm.id,
              title: nm.title,
              reSurfaced: nm.reSurfaced ?? false,
            });
            void presentMissionFromCapture({
              missionId: nm.id,
              title: nm.title,
              description: nm.description,
              points: nm.points,
              missionType: String(nm.type ?? nm.metadata?.type ?? 'real_world'),
              metadata: (nm.metadata ?? {}) as Record<string, unknown>,
            });
          } else {
            scLog('Mission presentation skipped — debounce or startup grace', {
              missionId: nm.id,
              reSurfaced: nm.reSurfaced ?? false,
            });
          }
        } else if (screenEventResponse.missionGeneration) {
          scLog('No new mission', screenEventResponse.missionGeneration);
        }
        setLastCaptureAt(payload.timestamp);
        lastCaptureMsRef.current = Date.now();
        setLastError(null);

        updateRiskAndInterval(combinedRiskScore);

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
        if (!__DEV__) {
          await getScreenCaptureModule().deleteFile(filePath).catch(() => undefined);
        }
        isProcessingRef.current = false;
      }
    },
    [maxTextLength, updateRiskAndInterval],
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
      if (alreadyGranted) {
        setPermissionGranted(true);
        return true;
      }

      const granted = await native.requestPermission();
      setPermissionGranted(granted);
      if (!granted) {
        setLastError(
          'Screen capture permission was not granted. Toggle monitoring off, then on again to retry.',
        );
      } else {
        setLastError(null);
      }
      return granted;
    } catch (err) {
      scError('requestPermission() threw', err);
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

  const refreshForegroundCache = useCallback(async (): Promise<void> => {
    lastAppPackageRef.current = null;
    const deadline = Date.now() + 2_000;

    await new Promise((resolve) => setTimeout(resolve, 500));

    while (Date.now() < deadline) {
      const fg = await resolveForegroundApp();
      if (isUsableForegroundPackage(fg.packageName)) {
        lastAppPackageRef.current = fg.packageName;
        lastAppPackageUpdatedAtRef.current = Date.now();
        setLastForegroundApp(fg.packageName);
        scLog('Foreground cache refreshed', {
          package: fg.packageName,
          label: fg.appLabel,
        });
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    scLog('Foreground cache refresh timed out — still on System UI or unknown');
  }, []);

  const startSmartCaptureTimers = useCallback(() => {
    clearAdaptiveTimers();

    appPollTimerRef.current = setInterval(() => {
      void (async () => {
        const fg = await resolveForegroundApp();
        const pkg = fg.packageName;
        if (!isUsableForegroundPackage(pkg)) {
          return;
        }

        const previousPkg = lastAppPackageRef.current;
        const appChanged = previousPkg !== null && pkg !== previousPkg;

        if (appChanged) {
          scLog('App switch detected', {
            from: previousPkg,
            to: pkg,
            label: fg.appLabel,
          });
          await tryCaptureNow('app_switch');
          scheduleFollowUpCapture(FOLLOW_UP_DELAY_MS);
        }

        lastAppPackageRef.current = pkg;
        lastAppPackageUpdatedAtRef.current = Date.now();
        setLastForegroundApp(pkg);

        if (appChanged || previousPkg === null) {
          refreshIntervalForApp();
        }
      })();
    }, APP_POLL_MS);

    refreshIntervalForApp();
    scLog('Smart capture timers started (adaptive)');
  }, [
    clearAdaptiveTimers,
    refreshIntervalForApp,
    scheduleFollowUpCapture,
    tryCaptureNow,
  ]);

  const startMonitoring = useCallback(async (): Promise<boolean> => {
    if (Platform.OS !== 'android') {
      return false;
    }
    if (isStartingRef.current) {
      return false;
    }

    isStartingRef.current = true;
    const nativePeriodicMs = Math.max(RISK_INTERVAL_LOW_MS, intervalMs);
    scLog('startMonitoring() start', { nativePeriodicMs, adaptive: true });

    const usageOk = await refreshUsageAccess();
    if (!usageOk) {
      scWarn('Usage access not granted — foreground app may be approximate');
    }

    try {
      const native = getScreenCaptureModule();
      let granted = await native.isPermissionGranted();
      if (!granted) {
        granted = await requestPermission();
      }
      if (!granted) {
        setLastError(
          'Screen capture permission was not granted. Toggle monitoring off, then on again to retry.',
        );
        return false;
      }

      await native.startCapture(nativePeriodicMs);

      riskHistoryRef.current = [];
      dynamicIntervalMsRef.current = RISK_INTERVAL_LOW_MS;
      setDynamicIntervalMs(RISK_INTERVAL_LOW_MS);
      setAppCategory(null);
      setAvgRiskScore(null);
      lastCaptureMsRef.current = 0;
      lastAppPackageRef.current = null;

      void refreshForegroundCache();

      setPermissionGranted(true);
      setIsMonitoring(true);
      setIsPaused(false);
      setLastError(null);
      markMonitoringStarted();
      clearStaleNotificationMissionLaunch();

      return true;
    } catch (err) {
      scError('startMonitoring() failed', err);
      const message = err instanceof Error ? err.message : String(err);
      setLastError(message);
      setIsMonitoring(false);
      return false;
    } finally {
      isStartingRef.current = false;
    }
  }, [intervalMs, refreshUsageAccess, requestPermission, refreshForegroundCache]);

  const stopMonitoring = useCallback(async (): Promise<void> => {
    if (Platform.OS !== 'android') {
      return;
    }
    scLog('stopMonitoring()');
    resetMissionCaptureSession();
    resetMissionPresentationGuard();
    clearAdaptiveTimers();
    try {
      await getScreenCaptureModule().stopCapture();
    } catch (err) {
      scError('stopMonitoring failed', err);
      setLastError(err instanceof Error ? err.message : String(err));
    }
    setIsMonitoring(false);
    setIsPaused(false);
    setPermissionGranted(false);
    riskHistoryRef.current = [];
  }, [clearAdaptiveTimers]);

  const pauseCapture = useCallback(async () => {
    if (Platform.OS !== 'android' || !isMonitoring) {
      return;
    }
    clearAdaptiveTimers();
    try {
      await getScreenCaptureModule().pauseCapture();
      setIsPaused(true);
    } catch (err) {
      scError('pauseCapture failed', err);
      setLastError(err instanceof Error ? err.message : String(err));
    }
  }, [isMonitoring, clearAdaptiveTimers]);

  const resumeCapture = useCallback(async () => {
    if (Platform.OS !== 'android' || !isMonitoringRef.current) {
      scLog('resumeCapture skipped — monitoring off');
      return;
    }
    try {
      await getScreenCaptureModule().resumeCapture();
      setIsPaused(false);
      scLog('resumeCapture OK');
    } catch (err) {
      scError('resumeCapture failed', err);
      setLastError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    registerMissionCaptureHandlers(pauseCapture, resumeCapture);
    return () => {
      unregisterMissionCaptureHandlers();
    };
  }, [pauseCapture, resumeCapture]);

  useEffect(() => {
    if (isMonitoring && isMissionCapturePaused()) {
      void pauseCapture();
    }
  }, [isMonitoring, pauseCapture]);

  useEffect(() => {
    if (Platform.OS !== 'android') {
      return undefined;
    }

    const captureSub = screenCaptureEmitter.addListener(
      SCREEN_CAPTURE_EVENTS.captured,
      (event: ScreenCapturedEvent) => {
        if (!isMonitoringRef.current) {
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
        const msg = event.message ?? '';
        const isBenign =
          /permission denied|cancelled|not ready/i.test(msg);
        if (isBenign) {
          scWarn('Native capture notice', msg);
        } else {
          scError('Native error event', msg);
        }
        setLastError(msg);
      },
    );

    return () => {
      captureSub.remove();
      errorSub.remove();
    };
  }, [onCycleComplete, processCapturedFrame]);

  useEffect(() => {
    if (!isMonitoring || isPaused || Platform.OS !== 'android') {
      clearAdaptiveTimers();
      return undefined;
    }
    startSmartCaptureTimers();
    return () => {
      clearAdaptiveTimers();
    };
  }, [isMonitoring, isPaused, startSmartCaptureTimers, clearAdaptiveTimers]);

  useEffect(() => {
    return () => {
      clearAdaptiveTimers();
      void stopMonitoring();
    };
  }, [stopMonitoring, clearAdaptiveTimers]);

  return {
    isMonitoring,
    isPaused,
    permissionGranted,
    usageAccessGranted,
    lastForegroundApp,
    dynamicIntervalMs,
    appCategory,
    avgRiskScore,
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
