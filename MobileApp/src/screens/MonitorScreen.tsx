import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { NsfwDebugPanel } from '../components/NsfwDebugPanel';
import { ScreenMonitor } from '../components/ScreenMonitor';

export function MonitorScreen(): React.JSX.Element {
  const [consentGranted] = useState(true);

  return (
    <View style={styles.container}>
      <ScreenMonitor consentGranted={consentGranted} intervalMs={60000} />
      {__DEV__ ? <NsfwDebugPanel /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
});
