import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { useScreenshotCapture } from '../hooks/useScreenshotCapture';
import getScreenCaptureModule from '../native/ScreenCapture';
import { scLog, scWarn } from '../utils/screenCaptureLogger';
import { getMonitoringIntent, setMonitoringIntent } from '../utils/monitoringIntent';
import type { CaptureCycleResult } from '../types/screenMonitor';

export interface ScreenMonitorProps {
  intervalMs?: number;
  consentGranted: boolean;
}

function showUsageAccessDialog(onOpenSettings: () => void): void {
  Alert.alert(
    'Usage access required',
    'To detect which app is on screen (Chrome, Instagram, etc.), enable Usage access for this app in system settings.\n\nWithout it, app names may show as "unknown".',
    [
      { text: 'Later', style: 'cancel' },
      { text: 'Open settings', onPress: onOpenSettings },
    ],
  );
}

export function ScreenMonitor({
  intervalMs = 60_000,
  consentGranted,
}: ScreenMonitorProps) {
  const [enabled, setEnabled] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [lastResult, setLastResult] = useState<CaptureCycleResult | null>(null);

  const onCycleComplete = useCallback((result: CaptureCycleResult) => {
    setLastResult(result);
  }, []);

  const {
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
  } = useScreenshotCapture({ intervalMs, onCycleComplete });

  useEffect(() => {
    if (Platform.OS === 'android') {
      void refreshUsageAccess();
    }
  }, [refreshUsageAccess]);

  /** Resume monitoring after MediaProjection consent reloads the React Activity. */
  useEffect(() => {
    if (Platform.OS !== 'android') {
      return;
    }

    let cancelled = false;

    (async () => {
      const wantsMonitoring = await getMonitoringIntent();
      if (!wantsMonitoring || cancelled) {
        return;
      }

      const nativeGranted = await getScreenCaptureModule().isPermissionGranted();
      if (!nativeGranted || cancelled) {
        return;
      }

      scLog('Auto-resuming monitoring after permission grant / app reload');
      const started = await startMonitoring();
      if (!cancelled) {
        setEnabled(started);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [startMonitoring]);

  const handleToggle = useCallback(
    async (value: boolean) => {
      if (isBusy) {
        scWarn('Toggle ignored — busy');
        return;
      }
      scLog('Toggle', { value, permissionGranted, usageAccessGranted });
      setIsBusy(true);
      try {
        await setMonitoringIntent(value);
        if (value) {
          const usageOk = await refreshUsageAccess();
          if (!usageOk) {
            showUsageAccessDialog(() => {
              void openUsageAccessSettings();
            });
          }
          const started = await startMonitoring();
          scLog('Toggle ON result', { started });
          setEnabled(started);
          if (started && !usageOk) {
            void refreshUsageAccess();
          }
        } else {
          await stopMonitoring();
          await setMonitoringIntent(false);
          scLog('Toggle OFF done');
          setEnabled(false);
        }
      } finally {
        setIsBusy(false);
      }
    },
    [
      isBusy,
      permissionGranted,
      usageAccessGranted,
      refreshUsageAccess,
      openUsageAccessSettings,
      startMonitoring,
      stopMonitoring,
    ],
  );

  if (Platform.OS !== 'android') {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Screen monitoring</Text>
        <Text style={styles.muted}>Android only.</Text>
      </View>
    );
  }

  if (!consentGranted) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Screen monitoring</Text>
        <Text style={styles.warning}>
          Parental consent (GDPR) is required before enabling monitoring.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Screen monitoring</Text>
      <Text style={styles.subtitle}>
        On-device OCR and vision. Captures on app switch; periodic interval adapts to risk and
        app type (browsers up to every 30s, games app-switch only). Nothing is uploaded as raw
        screenshots.
      </Text>

      <View style={styles.row}>
        <Text style={styles.label}>Monitoring active</Text>
        <Switch
          value={enabled}
          onValueChange={handleToggle}
          disabled={isBusy}
          accessibilityLabel="Enable or disable monitoring"
        />
      </View>

      <View style={styles.usageRow}>
        <Text style={styles.meta}>
          Usage access: {usageAccessGranted ? 'granted' : 'not granted'}
        </Text>
        {!usageAccessGranted && (
          <Pressable
            onPress={() => {
              showUsageAccessDialog(() => void openUsageAccessSettings());
            }}
            accessibilityRole="button">
            <Text style={styles.link}>Enable</Text>
          </Pressable>
        )}
      </View>

      {isBusy && (
        <View style={styles.statusRow}>
          <ActivityIndicator size="small" color="#2563eb" />
          <Text style={styles.status}>Starting…</Text>
        </View>
      )}

      {isMonitoring && !isBusy && (
        <View style={styles.statusRow}>
          <ActivityIndicator size="small" color="#2563eb" />
          <Text style={styles.status}>
            {dynamicIntervalMs > 0
              ? `Effective: every ${Math.round(dynamicIntervalMs / 1000)}s`
              : 'Periodic: off (app-switch only)'}
            {appCategory ? ` · ${appCategory}` : ''}
            {avgRiskScore != null ? ` · avg risk ${avgRiskScore}` : ''}
            {lastForegroundApp && lastForegroundApp !== 'unknown'
              ? ` · ${lastForegroundApp}`
              : ''}
            {isPaused ? ' (paused)' : ''}
          </Text>
        </View>
      )}

      {lastCaptureAt && (
        <Text style={styles.meta}>Last sync: {new Date(lastCaptureAt).toLocaleString()}</Text>
      )}

      {lastResult?.event && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Last event</Text>
          <Text style={styles.meta}>
            App: {lastResult.event.appLabel ?? lastResult.event.appPackage}
          </Text>
          <Text style={styles.meta}>Package: {lastResult.event.appPackage}</Text>
          <Text style={styles.meta}>
            Risk: {lastResult.event.riskFlag ? 'yes' : 'no'} ({lastResult.event.category})
          </Text>
          <Text style={styles.preview} numberOfLines={3}>
            {lastResult.event.extractedTextPreview || '(no text detected)'}
          </Text>
        </View>
      )}

      {lastResult?.skippedReason && (
        <Text style={styles.muted}>Cycle skipped: {lastResult.skippedReason}</Text>
      )}

      {lastError && <Text style={styles.error}>{lastError}</Text>}

      <Pressable
        style={styles.button}
        onPress={() => void requestPermission()}
        disabled={isBusy}
        accessibilityRole="button">
        <Text style={styles.buttonText}>Request MediaProjection permission</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 12 },
  title: { fontSize: 20, fontWeight: '700', color: '#0f172a' },
  subtitle: { fontSize: 14, color: '#475569' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  usageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  label: { fontSize: 16, color: '#1e293b' },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  status: { fontSize: 14, color: '#2563eb', flex: 1 },
  meta: { fontSize: 13, color: '#64748b' },
  link: { fontSize: 13, color: '#2563eb', fontWeight: '600' },
  card: {
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  cardTitle: { fontWeight: '600', marginBottom: 4, color: '#0f172a' },
  preview: { fontSize: 12, color: '#334155', marginTop: 4 },
  muted: { fontSize: 13, color: '#94a3b8' },
  warning: { fontSize: 14, color: '#b45309' },
  error: { fontSize: 13, color: '#dc2626' },
  button: {
    marginTop: 8,
    backgroundColor: '#2563eb',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonText: { color: '#fff', fontWeight: '600' },
});

export default ScreenMonitor;
