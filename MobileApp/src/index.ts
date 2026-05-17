export { ScreenMonitor } from './components/ScreenMonitor';
export { useScreenshotCapture } from './hooks/useScreenshotCapture';
export type { ScreenMonitorProps } from './components/ScreenMonitor';

export { setupAuthenticatedApi } from './auth/setupApiClient';
export { tokenStorage } from './auth/tokenStorage';

export {
  api,
  apiRequest,
  buildAuthHeaders,
  configureApiClient,
  ApiAuthError,
  ApiHttpError,
  postScreenEvent,
  postUsageSessions,
  suggestMission,
  completeMission,
  getDailyScores,
} from './services';
