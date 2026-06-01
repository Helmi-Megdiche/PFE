import { createNavigationContainerRef } from '@react-navigation/native';
import {
  flushPendingMissionNavigation,
  queueOrNavigateToMissionScreen,
} from './pendingMissionNavigation';
import type { RootStackParamList } from './types';

export const navigationRef = createNavigationContainerRef<RootStackParamList>();

export function navigateToMissionScreen(
  params: RootStackParamList['MissionScreen'],
): void {
  queueOrNavigateToMissionScreen(params);
}

export { flushPendingMissionNavigation };
