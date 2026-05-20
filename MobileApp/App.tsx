import React, {useEffect, useState} from 'react';
import {ActivityIndicator, SafeAreaView, StatusBar, StyleSheet, Text} from 'react-native';
import {AppApiBootstrap} from './src/auth/AppApiBootstrap';
import {ScreenMonitor} from './src/components/ScreenMonitor';
import {UsageTracker} from './src/components/UsageTracker';
import {tokenStorage} from './src/auth/tokenStorage';
import {useDevChildToken} from './src/auth/useDevChildToken';
import {getApiBaseUrl} from './src/config/apiConfig';
import {preloadImageClassifier} from './src/services/imageClassifier';

const API_BASE_URL = getApiBaseUrl();

function App(): React.JSX.Element {
  const [consentGranted] = useState(true);
  const {ready, error: tokenError} = useDevChildToken(API_BASE_URL);

  useEffect(() => {
    preloadImageClassifier();
  }, []);

  if (!ready) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator size="large" />
        <Text style={styles.hint}>Loading dev JWT…</Text>
      </SafeAreaView>
    );
  }

  return (
    <AppApiBootstrap
      baseUrl={API_BASE_URL}
      getAccessToken={() => tokenStorage.getToken()}>
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="dark-content" />
        {tokenError ? (
          <Text style={styles.error}>
            JWT error: {tokenError}. Start backend on port 3000.
          </Text>
        ) : null}
        <ScreenMonitor consentGranted={consentGranted} intervalMs={60000} />
        <UsageTracker enabled={consentGranted} />
      </SafeAreaView>
    </AppApiBootstrap>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  hint: {
    marginTop: 12,
    color: '#64748b',
  },
  error: {
    padding: 12,
    color: '#dc2626',
    fontSize: 13,
  },
});

export default App;
