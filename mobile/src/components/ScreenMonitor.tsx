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
import type { CaptureCycleResult } from '../types/screenMonitor';

export interface ScreenMonitorProps {
  /** Capture interval in ms (default 30s). */
  intervalMs?: number;
  /** Shown on consent screen before enabling monitoring. */
  consentGranted: boolean;
}

/**
 * Sprint 1 screen monitoring UI.
 *
 * Pipeline: MediaProjection capture → ML Kit OCR (on-device) → keyword filter →
 * POST metadata to /api/screen-events. Screenshots never leave the device.
 *
 * Note: react-native-vision-camera targets the device camera, not the screen.
 * Android screen capture requires MediaProjection via the ScreenCapture native module.
 */
export function ScreenMonitor({
  intervalMs = 30_000,
  consentGranted,
}: ScreenMonitorProps) {
  const [enabled, setEnabled] = useState(false);
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
  } = useScreenshotCapture({
    enabled: consentGranted && enabled,
    intervalMs,
    onCycleComplete,
  });

  const handleToggle = useCallback(
    async (value: boolean) => {
      if (value) {
        if (Platform.OS === 'android' && !permissionGranted) {
          const granted = await requestPermission();
          if (!granted) return;
        }
        setEnabled(true);
      } else {
        setEnabled(false);
      }
    },
    [permissionGranted, requestPermission],
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
          accessibilityLabel="Activer ou désactiver la surveillance"
        />
      </View>

      {isMonitoring && (
        <View style={styles.statusRow}>
          <ActivityIndicator size="small" color="#2563eb" />
          <Text style={styles.status}>
            Capture toutes les {Math.round(intervalMs / 1000)}s
            {isPaused ? ' (en pause)' : ''}
            {permissionGranted ? '' : ' — permission requise'}
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
        <Text style={styles.muted}>
          Cycle ignoré : {lastResult.skippedReason}
        </Text>
      )}

      {lastError && <Text style={styles.error}>{lastError}</Text>}

      <Pressable
        style={styles.button}
        onPress={() => void requestPermission()}
        accessibilityRole="button"
      >
        <Text style={styles.buttonText}>Demander permission MediaProjection</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    gap: 12,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0f172a',
  },
  subtitle: {
    fontSize: 14,
    color: '#475569',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  label: {
    fontSize: 16,
    color: '#1e293b',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  status: {
    fontSize: 14,
    color: '#2563eb',
  },
  meta: {
    fontSize: 13,
    color: '#64748b',
  },
  card: {
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  cardTitle: {
    fontWeight: '600',
    marginBottom: 4,
    color: '#0f172a',
  },
  preview: {
    fontSize: 12,
    color: '#334155',
    marginTop: 4,
  },
  muted: {
    fontSize: 13,
    color: '#94a3b8',
  },
  warning: {
    fontSize: 14,
    color: '#b45309',
  },
  error: {
    fontSize: 13,
    color: '#dc2626',
  },
  button: {
    marginTop: 8,
    backgroundColor: '#2563eb',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontWeight: '600',
  },
});

export default ScreenMonitor;
