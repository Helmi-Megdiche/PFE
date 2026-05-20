import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { classifyImage } from '../services/imageClassifier';
import { initModel } from '../services/nsfwClassifier';
import { getLastCapturePath } from '../utils/lastCapturePath';
import { scLog } from '../utils/screenCaptureLogger';
import { toMlKitImageUri } from '../utils/imageUri';

/**
 * Debug panel: classify the latest screen-capture JPEG via TFLite NSFW.
 * Enable with EXPO_PUBLIC_NSFW_DEBUG=1 or __DEV__ (see App.tsx).
 */
export function NsfwDebugPanel() {
  const [status, setStatus] = useState<string>('Idle');
  const [loading, setLoading] = useState(false);

  const runTest = useCallback(async () => {
    if (Platform.OS !== 'android') {
      setStatus('Android only');
      return;
    }
    setLoading(true);
    setStatus('Loading model…');
    try {
      await initModel();
      const filePath = getLastCapturePath();
      if (!filePath) {
        setStatus('No capture yet — enable monitoring and wait for a screenshot.');
        setLoading(false);
        return;
      }
      const uri = toMlKitImageUri(filePath);
      setStatus(`Classifying ${filePath.slice(-48)}…`);
      const result = await classifyImage(uri, filePath);
      const details = result.imageClassificationDetails;
      const line = [
        `source=${details?.source}`,
        `nsfw=${details?.nsfwSource}`,
        `risk=${details?.imageRiskScore}`,
        `adult=${(details?.adultScore ?? 0).toFixed(2)}`,
        `tflite=[${(details?.tfliteOutputs ?? []).map((n) => n.toFixed(2)).join(', ')}]`,
      ].join(' ');
      scLog('[NSFW Debug]', result);
      setStatus(line);
    } catch (err) {
      setStatus(`Error: ${String(err)}`);
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <View style={styles.box}>
      <Text style={styles.title}>NSFW TFLite debug</Text>
      <Pressable style={styles.btn} onPress={runTest} disabled={loading}>
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.btnText}>Classify last capture</Text>
        )}
      </Pressable>
      <Text style={styles.status}>{status}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    margin: 12,
    padding: 12,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  title: { fontSize: 14, fontWeight: '600', marginBottom: 8, color: '#334155' },
  btn: {
    backgroundColor: '#2563eb',
    padding: 10,
    borderRadius: 6,
    alignItems: 'center',
    minHeight: 40,
    justifyContent: 'center',
  },
  btnText: { color: '#fff', fontWeight: '600' },
  status: { marginTop: 8, fontSize: 12, color: '#475569' },
});
