import { AppState, type AppStateStatus } from 'react-native';
import { navigationRef } from './navigationRef';
import type { RootStackParamList } from './types';

let pendingMission: RootStackParamList['MissionScreen'] | null = null;

/**
 * Navigate to MissionScreen immediately, or queue until NavigationContainer is ready
 * and the app is in the foreground (capture often runs while child is on Instagram).
 */
export function queueOrNavigateToMissionScreen(
  params: RootStackParamList['MissionScreen'],
): void {
  const tryNavigate = (): boolean => {
    if (!navigationRef.isReady()) {
      return false;
    }
    if (AppState.currentState !== 'active') {
      pendingMission = params;
      return false;
    }
    navigationRef.navigate('MissionScreen', params);
    pendingMission = null;
    return true;
  };

  if (!tryNavigate()) {
    pendingMission = params;
  }
}

export function flushPendingMissionNavigation(): void {
  if (!pendingMission || !navigationRef.isReady()) {
    return;
  }
  if (AppState.currentState !== 'active') {
    return;
  }
  navigationRef.navigate('MissionScreen', pendingMission);
  pendingMission = null;
}

let appStateListenerAttached = false;

export function attachPendingMissionAppStateListener(): void {
  if (appStateListenerAttached) {
    return;
  }
  appStateListenerAttached = true;
  AppState.addEventListener('change', (next: AppStateStatus) => {
    if (next === 'active') {
      flushPendingMissionNavigation();
    }
  });
}
