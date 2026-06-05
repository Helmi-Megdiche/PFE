import React, { useEffect } from 'react';
import { ActivityIndicator, SafeAreaView, StyleSheet, Text } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { AppApiBootstrap } from './src/auth/AppApiBootstrap';
import { useDevChildToken } from './src/auth/useDevChildToken';
import { getApiBaseUrl } from './src/config/apiConfig';
import { preloadImageClassifier } from './src/services/imageClassifier';
import { RealUsageTracker } from './src/components/RealUsageTracker';
import { navigationRef, flushPendingMissionNavigation } from './src/navigation/navigationRef';
import { attachPendingMissionAppStateListener } from './src/navigation/pendingMissionNavigation';
import { AppNavigator } from './src/navigation/AppNavigator';
import { tokenStorage } from './src/auth/tokenStorage';
import { useMissionOverlayListener } from './src/hooks/useMissionOverlayListener';

const API_BASE_URL = getApiBaseUrl();

function App(): React.JSX.Element {
  const { ready, error: tokenError, hasToken, retry } = useDevChildToken(API_BASE_URL);

  useMissionOverlayListener();

  useEffect(() => {
    preloadImageClassifier();
    attachPendingMissionAppStateListener();
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
    <NavigationContainer
      ref={navigationRef}
      onReady={() => {
        flushPendingMissionNavigation();
      }}>
      <AppApiBootstrap
        baseUrl={API_BASE_URL}
        getAccessToken={() => tokenStorage.getToken()}>
        <SafeAreaView style={styles.container}>
          {tokenError ? (
            <Text style={styles.error}>
              JWT error: {tokenError}. Start backend on port 3000, then tap retry below.
            </Text>
          ) : null}
          {!hasToken && __DEV__ ? (
            <Text style={styles.hint} onPress={() => retry()}>
              No dev JWT yet — tap to retry token fetch
            </Text>
          ) : null}
          <AppNavigator />
          <RealUsageTracker hasToken={hasToken} />
        </SafeAreaView>
      </AppApiBootstrap>
    </NavigationContainer>
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
    textAlign: 'center',
    paddingHorizontal: 16,
  },
  error: {
    padding: 12,
    color: '#dc2626',
    fontSize: 13,
  },
});

export default App;
