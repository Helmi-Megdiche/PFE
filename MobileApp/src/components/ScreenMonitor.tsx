import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { useScreenshotCapture } from '../hooks/useScreenshotCapture';
import { scLog, scWarn } from '../utils/screenCaptureLogger';
import type { CaptureCycleResult } from '../types/screenMonitor';

export interface ScreenMonitorProps {
  intervalMs?: number;
  consentGranted: boolean;
}

export function ScreenMonitor({
  intervalMs = 30_000,
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
    lastError,
    lastCaptureAt,
    requestPermission,
    startMonitoring,
    stopMonitoring,
  } = useScreenshotCapture({ intervalMs, onCycleComplete });

  const handleToggle = useCallback(
    async (value: boolean) => {
      if (isBusy) {
        scWarn('Toggle ignored — busy');
        return;
      }
      scLog('Toggle', { value, permissionGranted });
      setIsBusy(true);
      try {
        if (value) {
          const started = await startMonitoring();
          scLog('Toggle ON result', { started });
          setEnabled(started);
        } else {
          await stopMonitoring();
          scLog('Toggle OFF done');
          setEnabled(false);
        }
      } finally {
        setIsBusy(false);
      }
    },
    [isBusy, permissionGranted, startMonitoring, stopMonitoring],
  );

  if (Platform.OS !== 'android') {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Surveillance d'écran</Text>
        <Text style={styles.muted}>Disponible uniquement sur Android.</Text>
      </View>
    );
  }

  if (!consentGranted) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Surveillance d'écran</Text>
        <Text style={styles.warning}>
          Le consentement parental (RGPD) est requis avant d'activer la surveillance.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Surveillance d'écran</Text>
      <Text style={styles.subtitle}>
        OCR et analyse sur l'appareil. Aucune capture n'est envoyée au serveur.
      </Text>

      <View style={styles.row}>
        <Text style={styles.label}>Monitoring actif</Text>
        <Switch
          value={enabled}
          onValueChange={handleToggle}
          disabled={isBusy}
          accessibilityLabel="Activer ou désactiver la surveillance"
        />
      </View>

      {isBusy && (
        <View style={styles.statusRow}>
          <ActivityIndicator size="small" color="#2563eb" />
          <Text style={styles.status}>Démarrage…</Text>
        </View>
      )}

      {isMonitoring && !isBusy && (
        <View style={styles.statusRow}>
          <ActivityIndicator size="small" color="#2563eb" />
          <Text style={styles.status}>
            Capture toutes les {Math.round(intervalMs / 1000)}s
            {isPaused ? ' (en pause)' : ''}
          </Text>
        </View>
      )}

      {lastCaptureAt && (
        <Text style={styles.meta}>Dernière sync : {new Date(lastCaptureAt).toLocaleString()}</Text>
      )}

      {lastResult?.event && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Dernier événement</Text>
          <Text style={styles.meta}>App : {lastResult.event.appPackage}</Text>
          <Text style={styles.meta}>
            Risque : {lastResult.event.riskFlag ? 'oui' : 'non'} ({lastResult.event.category})
          </Text>
          <Text style={styles.preview} numberOfLines={3}>
            {lastResult.event.extractedTextPreview || '(aucun texte détecté)'}
          </Text>
        </View>
      )}

      {lastResult?.skippedReason && (
        <Text style={styles.muted}>Cycle ignoré : {lastResult.skippedReason}</Text>
      )}

      {lastError && <Text style={styles.error}>{lastError}</Text>}

      <Pressable
        style={styles.button}
        onPress={() => void requestPermission()}
        disabled={isBusy}
        accessibilityRole="button">
        <Text style={styles.buttonText}>Demander permission MediaProjection</Text>
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
  label: { fontSize: 16, color: '#1e293b' },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  status: { fontSize: 14, color: '#2563eb' },
  meta: { fontSize: 13, color: '#64748b' },
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
